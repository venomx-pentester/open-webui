<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowPath from '$lib/components/icons/ArrowPath.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import {
		scanSessions,
		completeScanSession,
		confirmPhase2,
		skipExploitation,
		type DispatchEntry
	} from '$lib/stores/scanSessions';
	import { activeRunTargetId, reconnectAgentStream } from '$lib/stores/agentRunnerStream';
	import { vxAction } from '$lib/utils/venomxDebug';
	import { activeQueueTargetId, activeTargetId } from '$lib/stores/targets';

	const i18n = getContext<any>('i18n');
	export let onClose: () => void = () => {};

	let elapsedDisplay = '00:00';
	let elapsedInterval: ReturnType<typeof setInterval> | null = null;
	let isStoppingRun = false;

	const fmtElapsed = (ms: number) => {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
	};

	const isLiveLifecycle = (lifecycle: string | null | undefined) =>
		lifecycle === 'queued' || lifecycle === 'running' || lifecycle === 'paused';

	$: preferredTargetIds = [$activeRunTargetId, $activeQueueTargetId, $activeTargetId].filter(
		(id): id is string => Boolean(id)
	);
	$: liveSessionEntry = (() => {
		for (const id of preferredTargetIds) {
			const candidate = $scanSessions[id];
			if (candidate && isLiveLifecycle(candidate.lifecycle)) {
				return { targetId: id, session: candidate };
			}
		}

		for (const [id, candidate] of Object.entries($scanSessions)) {
			if (candidate && isLiveLifecycle(candidate.lifecycle)) {
				return { targetId: id, session: candidate };
			}
		}

		return null;
	})();
	$: resolvedTargetId = liveSessionEntry?.targetId ?? null;
	$: session = liveSessionEntry?.session ?? null;
	$: isRunning = session?.lifecycle === 'running';
	$: isPaused = session?.lifecycle === 'paused';
	$: isComplete = session?.lifecycle === 'complete';
	$: isError = session?.lifecycle === 'error';
	$: hasSession = session !== null;
	$: doneCount = session?.dispatches.filter((d) => d.status === 'done').length ?? 0;
	$: totalCount = session?.dispatches.length ?? 0;
	$: dispatchLine =
		totalCount === 0 ? 'Dispatch pipeline — pending' : `${doneCount}/${totalCount} specialists`;
	$: recentActivity = session ? [...session.activity].reverse().slice(0, 24) : [];

	$: shortSessionRef = session?.id ? `${session.id.slice(0, 8)}…` : '';
	$: specialistLabel = session?.specialist
		? `${session.specialist.charAt(0).toUpperCase()}${session.specialist.slice(1)} Specialist`
		: null;

	$: {
		if (elapsedInterval) {
			clearInterval(elapsedInterval);
			elapsedInterval = null;
		}
		if (session && (isRunning || isPaused)) {
			const update = () => {
				if (session) {
					elapsedDisplay = fmtElapsed(Date.now() - session.startedAt);
				}
			};
			update();
			elapsedInterval = setInterval(update, 1000);
		} else if (session) {
			const end = session.endedAt ?? session.updatedAt;
			elapsedDisplay = fmtElapsed(end - session.startedAt);
		} else {
			elapsedDisplay = '00:00';
		}
	}

	onDestroy(() => {
		if (elapsedInterval) clearInterval(elapsedInterval);
	});

	const dispatchIcon = (status: DispatchEntry['status']): string => {
		switch (status) {
			case 'done':
				return '✓';
			case 'active':
				return '▸';
			case 'error':
				return '✕';
			case 'awaiting':
				return '⏳';
			case 'skipped':
				return '—';
			default:
				return '·';
		}
	};

	const handleReconnectStream = () => {
		if (!resolvedTargetId) return;
		vxAction('Reconnect agent stream', { targetId: resolvedTargetId });
		const ok = reconnectAgentStream(resolvedTargetId);
		if (ok) {
			toast.success($i18n.t('Reconnecting to agent stream…'));
		} else {
			toast.error(
				$i18n.t(
					'No run ID on this session yet. Wait for the assistant message that includes the run ID, then try again.'
				)
			);
		}
	};

	const handleStopRun = async () => {
		if (!resolvedTargetId) return;
		if (isStoppingRun) return;

		isStoppingRun = true;

		if (isConnected(resolvedTargetId)) {
			disconnectRun(resolvedTargetId);
		}

		clearAgentHandshake(resolvedTargetId);
		completeScanSession(resolvedTargetId, {
			errorMessage: 'Run was stopped by operator.'
		});
		toast.success($i18n.t('Run stopped'));
		isStoppingRun = false;
	};

	const activityBorderClass = (msg: string): string => {
		const m = msg.toLowerCase();
		if (msg.includes('Running ')) return 'ar-act-tool';
		if (msg.includes('completed') || msg.includes(' OK')) return 'ar-act-ok';
		if (msg.includes('failed') || m.includes('error')) return 'ar-act-err';
		if (msg.includes('Dispatching')) return 'ar-act-dispatch';
		if (msg.includes('Phase') || msg.includes('confirmation')) return 'ar-act-phase';
		return 'ar-act-info';
	};

	const activityToneClass = (item: { message: string; stageId: string }): string => {
		const base = activityBorderClass(item.message);

		if (base === 'ar-act-ok' || base === 'ar-act-err' || base === 'ar-act-tool') {
			return base;
		}

		if (item.stageId === 'queued') {
			return 'ar-act-queued';
		}

		if (item.stageId === 'asset_validation') {
			return 'ar-act-asset';
		}

		if (item.stageId === 'surface_enumeration') {
			return 'ar-act-surface';
		}

		if (item.stageId === 'service_analysis') {
			return 'ar-act-service';
		}

		if (item.stageId === 'findings_assembly') {
			return session?.phase === 2 ? 'ar-act-exploit' : 'ar-act-findings';
		}

		return base;
	};
</script>

<!-- Panel styled as a neutral run inspector that matches the rest of the app -->
<aside
	class="agent-runner-panel h-full w-80 max-w-[20rem] flex flex-col"
	data-lifecycle={session?.lifecycle ?? 'idle'}
	aria-label={$i18n.t('Agent Runner')}
>
	<!-- Header -->
	<div class="ar-header">
		<div class="min-w-0">
			<div class="ar-title-row">
				{#if isRunning}
					<span class="ar-pulse" aria-hidden="true"></span>
				{/if}
				<span class="ar-title">{$i18n.t('Agent Runner')}</span>
			</div>
			<div class="ar-meta">
				{#if session}
					{#if specialistLabel}
						{specialistLabel}
					{:else}
						Phase {session.phase || 1}{session.phase === 2 ? ' — Exploitation' : ' — Reconnaissance'}
					{/if}
				{:else}
					{$i18n.t('No active run')}
				{/if}
			</div>
			<div class="ar-submeta">
				{$i18n.t('Tracks the current pentest run, dispatches, and operator actions.')}
			</div>
		</div>
		<div class="ar-header-actions">
			<button
				type="button"
				class="ar-icon-btn"
				aria-label={$i18n.t('Reconnect agent stream')}
				title={session?.agentRunId
					? $i18n.t(
							'Reconnect to the agent event stream (server replays events you may have missed)'
						)
					: $i18n.t(
							'Check attachment state or reconnect once a run ID is available from chat/agent events'
						)}
				disabled={!resolvedTargetId}
				on:click={handleReconnectStream}
			>
				<ArrowPath className="size-4" strokeWidth="2" />
			</button>
			<button type="button" class="ar-icon-btn" aria-label={$i18n.t('Close')} on:click={onClose}>
				<XMark className="size-4" strokeWidth="2" />
			</button>
		</div>
	</div>

	{#if !hasSession}
		<div class="ar-empty">
			<div class="ar-empty-icon" aria-hidden="true">⬡</div>
			<p class="ar-empty-copy">
				Send <code class="ar-empty-code">/pentest &lt;target&gt;</code> in chat to start a run. The live
				sidebar will stay pinned here while the agent is active.
			</p>
		</div>
	{:else if session}
		<div
			class="ar-scroll flex flex-col flex-1 min-h-0 gap-2.5 {isPaused && session?.reviewed
				? 'ar-scroll-actions'
				: ''}"
		>
			<!-- Run info (mockup: run-target → badges → run id) -->
			<div class="ar-run-card">
				<div class="ar-run-target">{session.targetName}</div>
				<div class="ar-badge-row">
					<span
						class="ar-badge {isComplete
							? 'ar-badge-done'
							: isError
								? 'ar-badge-err'
								: isPaused
									? 'ar-badge-wait'
									: 'ar-badge-run'}"
					>
						{isComplete
							? 'Complete'
							: isError
								? 'Error'
								: isPaused
									? 'Awaiting Confirm'
									: 'Running'}
					</span>
					{#if !session.specialist}
						<span class="ar-badge ar-badge-phase">Phase {session.phase || 1}</span>
					{:else}
						<span class="ar-badge ar-badge-phase">{specialistLabel}</span>
					{/if}
				</div>
				{#if session.agentRunId}
					<div class="ar-run-id" title={session.agentRunId}>Run ID · {session.agentRunId}</div>
				{:else}
					<div class="ar-run-id ar-run-id-muted">Run ID · pending stream…</div>
				{/if}
				<div class="ar-session-ref" title={session.id}>Session · {shortSessionRef}</div>
			</div>

			<!-- Outcome or progress -->
			{#if isError}
				<div class="ar-banner ar-banner-err">
					<span class="ar-banner-ic">✕</span>
					<div>
						<div class="ar-banner-title ar-banner-title-err">
							Run failed{session.errorSpecialist ? ` at ${session.errorSpecialist}` : ''}
						</div>
						<div class="ar-banner-sub">
							{session.errorMessage ?? 'An unexpected error occurred.'}
						</div>
					</div>
				</div>
			{:else if isComplete}
				<div class="ar-banner ar-banner-ok">
					<span class="ar-banner-ic">✓</span>
					<div>
						<div class="ar-banner-title ar-banner-title-ok">Run finished</div>
						<div class="ar-banner-sub">
							{#if session.phase === 1}
								{doneCount} specialists completed — exploitation skipped
							{:else}
								{totalCount} specialists completed in {elapsedDisplay}
							{/if}
						</div>
					</div>
				</div>
			{:else if isPaused}
				<div class="ar-banner ar-banner-warn">
					<span class="ar-banner-ic">⏳</span>
					<div>
						<div class="ar-banner-title ar-banner-title-warn">Awaiting confirmation</div>
						<div class="ar-banner-sub">
							{#if session.reviewed}
								Review the activity log, then confirm or skip below.
							{:else}
								Phase 1 reconnaissance complete. Waiting for approval to proceed.
							{/if}
						</div>
					</div>
				</div>
				<div class="ar-progress-block">
					<div class="ar-progress-head">
						<span>{dispatchLine}</span>
						<span class="ar-progress-pct">{session.progress}%</span>
					</div>
					<div class="ar-track">
						<div class="ar-fill ar-fill-paused" style="width: {session.progress}%"></div>
					</div>
				</div>
			{:else}
				<div class="ar-progress-block">
					<div class="ar-progress-head">
						<span>{dispatchLine}</span>
						<span class="ar-progress-pct">{session.progress}%</span>
					</div>
					<div class="ar-track">
						<div class="ar-fill ar-fill-run" style="width: {session.progress}%"></div>
					</div>
					{#if totalCount === 0 && (isRunning || isPaused)}
						<p class="ar-hint">
							Specialist rows appear when the remote agent emits dispatches. Ensure a
							<code class="ar-hint-code">Run ID</code> appears in chat so the event stream connects.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Stats -->
			<div class="ar-stat-grid">
				<div class="ar-stat-card">
					<div class="ar-stat-label">Elapsed</div>
					<div class="ar-stat-value">{elapsedDisplay}</div>
				</div>
				<div class="ar-stat-card">
					<div class="ar-stat-label">Dispatches</div>
					<div class="ar-stat-value">{totalCount === 0 ? '—' : `${doneCount}/${totalCount}`}</div>
				</div>
			</div>

			<!-- Dispatch pipeline -->
			{#if session.dispatches.length > 0}
				<div class="ar-section-label">Dispatch Pipeline</div>
				<div class="ar-dispatch-list">
					{#each session.dispatches as dispatch (dispatch.key)}
						<div
							class="ar-dispatch {dispatch.status === 'active'
								? 'ar-dispatch-active'
								: dispatch.status === 'awaiting'
									? 'ar-dispatch-await'
									: dispatch.status === 'done'
										? 'ar-dispatch-done'
										: dispatch.status === 'skipped'
											? 'ar-dispatch-skip'
											: dispatch.status === 'error'
												? 'ar-dispatch-err'
												: ''}"
						>
							<div class="ar-dispatch-ic">{dispatchIcon(dispatch.status)}</div>
							<div class="ar-dispatch-name">{dispatch.label}</div>
							<div class="ar-dispatch-detail">
								{#if dispatch.status === 'done' && dispatch.summary}
									{dispatch.summary.slice(0, 52)}
								{:else if dispatch.status === 'active'}
									executing…
								{:else if dispatch.status === 'awaiting'}
									awaiting confirmation
								{:else if dispatch.status === 'skipped'}
									skipped
								{/if}
							</div>
							{#if dispatch.status === 'done' && (dispatch.nodesAdded ?? 0) > 0}
								<div class="ar-dispatch-nodes">+{dispatch.nodesAdded}</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="ar-section-label">Dispatch Pipeline</div>
				<div class="ar-dispatch-empty">
					No specialist rows yet. They appear when the agent-runner emits
					<code class="ar-hint-code">dispatch</code> events over the stream.
				</div>
			{/if}

			<!-- Activity -->
			{#if recentActivity.length > 0}
				<div class="ar-activity-section">
					<div class="ar-section-label">Live Activity</div>
					<div class="ar-activity-list">
						{#each recentActivity as item (item.id)}
							<div class="ar-activity-item {activityToneClass(item)}">
								<div class="ar-activity-time">
									{new Date(item.timestamp).toLocaleTimeString('en-US', {
										hour12: false,
										hour: '2-digit',
										minute: '2-digit',
										second: '2-digit'
									})}
								</div>
								<div class="ar-activity-msg">{item.message}</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Footer -->
	<div class="ar-footer">
		{#if isRunning}
			<button
				type="button"
				class="ar-btn ar-btn-stop"
				disabled={isStoppingRun}
				on:click={handleStopRun}
			>
				{isStoppingRun ? $i18n.t('Stopping…') : $i18n.t('Stop Run')}
			</button>
		{/if}

		{#if isPaused && session?.reviewed && resolvedTargetId}
			<button
				type="button"
				class="ar-btn ar-btn-primary"
				on:click={() => { vxAction('Phase2 Confirm (sidebar)', { targetId: resolvedTargetId }); confirmPhase2(resolvedTargetId); }}
			>
				{$i18n.t('Confirm Phase 2')}
			</button>
			<button
				type="button"
				class="ar-btn ar-btn-stop"
				on:click={() => { vxAction('Phase2 Skip (sidebar)', { targetId: resolvedTargetId }); skipExploitation(resolvedTargetId); }}
			>
				{$i18n.t('Skip Exploitation')}
			</button>
		{/if}

		<a href="/workspace/targets" class="ar-btn ar-btn-secondary">
			{$i18n.t('Manage Targets')}
		</a>
	</div>
</aside>

<style>
	/* Tokens for light mode; dark mode overrides are defined below. */
	.agent-runner-panel {
		--ar-border: rgba(148, 163, 184, 0.26);
		--ar-border-soft: rgba(148, 163, 184, 0.18);
		--ar-bg: rgba(255, 255, 255, 0.86);
		--ar-card: rgba(248, 250, 252, 0.94);
		--ar-text: #0f172a;
		--ar-muted: #64748b;
		--ar-dim: #94a3b8;
		--ar-accent: #0f172a;
		--ar-accent-glow: rgba(15, 23, 42, 0.06);
		--ar-cyan: #0f766e;
		--ar-green: #15803d;
		--ar-amber: #b45309;
		--ar-red: #b91c1c;
		--ar-violet: #4f46e5;

		padding: 12px;
		border-radius: 18px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-bg);
		backdrop-filter: blur(20px) saturate(1.35);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
			0 12px 32px rgba(15, 23, 42, 0.08);
		color: var(--ar-text);
	}

	:global(.dark) .agent-runner-panel,
	:global(html.dark) .agent-runner-panel {
		--ar-border: rgba(51, 65, 85, 0.72);
		--ar-border-soft: rgba(51, 65, 85, 0.52);
		--ar-bg: rgba(15, 23, 42, 0.9);
		--ar-card: rgba(15, 23, 42, 0.72);
		--ar-text: #e2e8f0;
		--ar-muted: #94a3b8;
		--ar-dim: #64748b;
		--ar-accent: #e2e8f0;
		--ar-accent-glow: rgba(226, 232, 240, 0.08);
		--ar-cyan: #67e8f9;
		--ar-green: #4ade80;
		--ar-amber: #fbbf24;
		--ar-red: #f87171;
		--ar-violet: #a78bfa;
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
			0 14px 34px rgba(0, 0, 0, 0.24);
	}

	.ar-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding: 4px 4px 12px;
		border-bottom: 1px solid var(--ar-border-soft);
	}

	.ar-title-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ar-title {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.015em;
		color: var(--ar-text);
		line-height: 1.2;
	}

	.ar-meta {
		font-size: 12px;
		font-weight: 500;
		color: var(--ar-muted);
		margin-top: 4px;
		line-height: 1.45;
	}

	.ar-pulse {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--ar-green);
		box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
		animation: ar-pulse 2s ease-in-out infinite;
	}

	@keyframes ar-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
		}
		50% {
			box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
		}
	}

	.ar-header-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.ar-icon-btn {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--ar-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.ar-icon-btn:hover:not(:disabled) {
		background: rgba(15, 23, 42, 0.06);
		color: var(--ar-text);
	}

	.ar-icon-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	:global(.dark) .ar-icon-btn:hover:not(:disabled),
	:global(html.dark) .ar-icon-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}

	.ar-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 36px 18px;
		gap: 12px;
	}

	.ar-empty-icon {
		font-size: 32px;
		opacity: 0.28;
		line-height: 1;
	}

	.ar-empty-copy {
		font-size: 14px;
		color: var(--ar-dim);
		max-width: 260px;
		line-height: 1.6;
	}

	.ar-empty-code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 6px;
		border: 1px solid var(--ar-border-soft);
		background: rgba(241, 245, 249, 0.95);
	}

	:global(.dark) .ar-empty-code,
	:global(html.dark) .ar-empty-code {
		background: rgba(0, 0, 0, 0.2);
	}

	.ar-scroll {
		flex: 1;
		min-height: 0;
		padding-top: 4px;
		overflow-y: auto;
		overflow-x: hidden;
		padding-right: 2px;
	}

	.ar-run-card {
		margin-top: 8px;
		padding: 14px 15px;
		border-radius: 14px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.ar-run-target {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 17px;
		font-weight: 600;
		color: var(--ar-cyan);
		line-height: 1.45;
		word-break: break-all;
	}

	.ar-submeta {
		font-size: 12px;
		line-height: 1.45;
		color: var(--ar-dim);
		margin-top: 6px;
		max-width: 30ch;
	}

	.ar-badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.ar-badge {
		font-size: 11px;
		font-weight: 600;
		padding: 4px 9px;
		border-radius: 999px;
		line-height: 1;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.ar-badge-run {
		background: var(--ar-accent-glow);
		color: var(--ar-accent);
		border: 1px solid rgba(59, 130, 246, 0.28);
	}

	.ar-badge-wait {
		background: rgba(245, 158, 11, 0.12);
		color: var(--ar-amber);
		border: 1px solid rgba(245, 158, 11, 0.22);
	}

	.ar-badge-done {
		background: rgba(34, 197, 94, 0.12);
		color: var(--ar-green);
		border: 1px solid rgba(34, 197, 94, 0.22);
	}

	.ar-badge-err {
		background: rgba(239, 68, 68, 0.1);
		color: var(--ar-red);
		border: 1px solid rgba(239, 68, 68, 0.22);
	}

	.ar-badge-phase {
		background: rgba(139, 92, 246, 0.12);
		color: var(--ar-violet);
		border: 1px solid rgba(139, 92, 246, 0.22);
	}

	.ar-run-id {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
		color: var(--ar-dim);
		word-break: break-all;
		line-height: 1.45;
	}

	.ar-run-id-muted {
		color: var(--ar-muted);
		font-style: italic;
	}

	.ar-session-ref {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		color: var(--ar-dim);
		opacity: 0.85;
	}

	.ar-banner {
		margin-top: 10px;
		padding: 10px 11px;
		border-radius: 12px;
		font-size: 13px;
		display: flex;
		align-items: flex-start;
		gap: 9px;
		line-height: 1.5;
	}

	.ar-banner-ic {
		font-size: 15px;
		line-height: 1;
		margin-top: 1px;
		flex-shrink: 0;
	}

	.ar-banner-title {
		font-weight: 700;
		margin-bottom: 2px;
	}

	.ar-banner-sub {
		font-size: 12px;
		color: var(--ar-muted);
		line-height: 1.55;
	}

	.ar-banner-err {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.22);
	}

	.ar-banner-title-err {
		color: var(--ar-red);
	}

	.ar-banner-ok {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.22);
	}

	.ar-banner-title-ok {
		color: var(--ar-green);
	}

	.ar-banner-warn {
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.22);
	}

	.ar-banner-title-warn {
		color: var(--ar-amber);
	}

	.ar-progress-block {
		margin-top: 8px;
	}

	.ar-progress-head {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: var(--ar-muted);
		margin-bottom: 5px;
	}

	.ar-progress-pct {
		font-variant-numeric: tabular-nums;
	}

	.ar-track {
		height: 8px;
		border-radius: 999px;
		background: rgba(59, 130, 246, 0.12);
		overflow: hidden;
		position: relative;
	}

	.ar-fill {
		height: 100%;
		border-radius: 999px;
		transition: width 0.55s cubic-bezier(0.25, 0.8, 0.25, 1);
		position: relative;
	}

	.ar-fill-run {
		background: linear-gradient(90deg, #0f172a, #334155);
	}

	.ar-fill-run::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 24px;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22));
		border-radius: 999px;
		animation: ar-shimmer 1.5s ease-in-out infinite;
	}

	.ar-fill-paused {
		background: linear-gradient(90deg, #b45309, #d97706);
	}

	@keyframes ar-shimmer {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 0.85;
		}
	}

	.ar-hint {
		font-size: 11px;
		color: var(--ar-muted);
		margin-top: 6px;
		line-height: 1.5;
	}

	.ar-hint-code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		padding: 0 4px;
		border-radius: 4px;
		background: rgba(241, 245, 249, 1);
	}

	:global(.dark) .ar-hint-code,
	:global(html.dark) .ar-hint-code {
		background: rgba(0, 0, 0, 0.2);
	}

	.ar-stat-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: 8px;
	}

	.ar-stat-card {
		padding: 12px 12px;
		border-radius: 12px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
	}

	.ar-stat-label {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ar-dim);
	}

	.ar-stat-value {
		font-size: 14px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		margin-top: 4px;
		color: var(--ar-text);
	}

	.ar-section-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--ar-muted);
		margin: 12px 0 7px 2px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.ar-dispatch-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-height: min(24vh, 180px);
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding-right: 2px;
	}

	.ar-dispatch {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 12px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
		font-size: 12px;
		min-height: 36px;
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
	}

	.ar-dispatch-active {
		border-color: rgba(59, 130, 246, 0.35);
		background: var(--ar-accent-glow);
	}

	.ar-dispatch-await {
		border-color: rgba(245, 158, 11, 0.28);
		background: rgba(245, 158, 11, 0.06);
	}

	.ar-dispatch-done {
		opacity: 0.72;
	}

	.ar-dispatch-skip {
		opacity: 0.48;
	}

	.ar-dispatch-err {
		border-color: rgba(239, 68, 68, 0.28);
		background: rgba(239, 68, 68, 0.06);
	}

	.ar-dispatch-ic {
		width: 20px;
		height: 20px;
		border-radius: 7px;
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 700;
		flex-shrink: 0;
		background: rgba(100, 116, 139, 0.15);
		color: var(--ar-dim);
	}

	.ar-dispatch-active .ar-dispatch-ic {
		background: var(--ar-accent-glow);
		color: var(--ar-accent);
	}

	.ar-dispatch-await .ar-dispatch-ic {
		background: rgba(245, 158, 11, 0.15);
		color: var(--ar-amber);
	}

	.ar-dispatch-done .ar-dispatch-ic {
		background: rgba(34, 197, 94, 0.12);
		color: var(--ar-green);
	}

	.ar-dispatch-err .ar-dispatch-ic {
		background: rgba(239, 68, 68, 0.12);
		color: var(--ar-red);
	}

	.ar-dispatch-name {
		font-weight: 600;
		flex-shrink: 0;
		color: var(--ar-text);
		max-width: 9.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ar-dispatch-detail {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11px;
		color: var(--ar-dim);
	}

	.ar-dispatch-nodes {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
		color: var(--ar-green);
		flex-shrink: 0;
	}

	.ar-dispatch-empty {
		border-radius: 14px;
		border: 1px dashed var(--ar-border-soft);
		background: rgba(59, 130, 246, 0.04);
		padding: 10px 12px;
		font-size: 11px;
		color: var(--ar-muted);
		line-height: 1.5;
	}

	.ar-activity-section {
		display: block;
		flex: 0 0 auto;
		min-height: auto;
	}

	.ar-activity-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 0 0 auto;
		min-height: 9rem;
		max-height: min(34vh, 250px);
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding-bottom: 4px;
	}

	.ar-scroll-actions .ar-activity-list {
		min-height: 8rem;
		max-height: min(28vh, 200px);
	}

	.ar-activity-item {
		padding: 8px 10px;
		border-radius: 10px;
		font-size: 12px;
		line-height: 1.5;
		border-left: 2px solid transparent;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
	}

	.ar-act-tool {
		border-left-color: var(--ar-accent);
		background: rgba(15, 23, 42, 0.05);
	}
	.ar-act-ok {
		border-left-color: var(--ar-green);
		background: rgba(34, 197, 94, 0.1);
	}
	.ar-act-err {
		border-left-color: var(--ar-red);
		background: rgba(239, 68, 68, 0.1);
	}
	.ar-act-dispatch {
		border-left-color: var(--ar-violet);
		background: rgba(79, 70, 229, 0.08);
	}
	.ar-act-phase {
		border-left-color: var(--ar-amber);
		background: rgba(245, 158, 11, 0.1);
	}
	.ar-act-info {
		border-left-color: var(--ar-dim);
		background: rgba(148, 163, 184, 0.12);
	}

	.ar-act-queued {
		border-left-color: #64748b;
		background: rgba(148, 163, 184, 0.14);
	}

	.ar-act-asset {
		border-left-color: #0ea5e9;
		background: rgba(14, 165, 233, 0.12);
	}

	.ar-act-surface {
		border-left-color: #3b82f6;
		background: rgba(59, 130, 246, 0.12);
	}

	.ar-act-service {
		border-left-color: #8b5cf6;
		background: rgba(139, 92, 246, 0.12);
	}

	.ar-act-findings {
		border-left-color: #f59e0b;
		background: rgba(245, 158, 11, 0.12);
	}

	.ar-act-exploit {
		border-left-color: #22c55e;
		background: rgba(34, 197, 94, 0.12);
	}

	:global(.dark) .ar-fill-run,
	:global(html.dark) .ar-fill-run {
		background: linear-gradient(90deg, #67e8f9, #22d3ee);
	}

	:global(.dark) .ar-fill-paused,
	:global(html.dark) .ar-fill-paused {
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
	}

	:global(.dark) .ar-act-tool,
	:global(html.dark) .ar-act-tool {
		background: rgba(103, 232, 249, 0.13);
	}

	:global(.dark) .ar-act-queued,
	:global(html.dark) .ar-act-queued {
		background: rgba(100, 116, 139, 0.2);
	}

	:global(.dark) .ar-act-asset,
	:global(html.dark) .ar-act-asset {
		background: rgba(14, 165, 233, 0.18);
	}

	:global(.dark) .ar-act-surface,
	:global(html.dark) .ar-act-surface {
		background: rgba(59, 130, 246, 0.18);
	}

	:global(.dark) .ar-act-service,
	:global(html.dark) .ar-act-service {
		background: rgba(139, 92, 246, 0.18);
	}

	:global(.dark) .ar-act-findings,
	:global(html.dark) .ar-act-findings {
		background: rgba(245, 158, 11, 0.2);
	}

	:global(.dark) .ar-act-exploit,
	:global(html.dark) .ar-act-exploit {
		background: rgba(34, 197, 94, 0.2);
	}

	:global(.dark) .ar-act-info,
	:global(html.dark) .ar-act-info {
		background: rgba(148, 163, 184, 0.18);
	}

	:global(.dark) .ar-activity-item,
	:global(html.dark) .ar-activity-item {
		border-color: rgba(51, 65, 85, 0.9);
	}

	.ar-activity-time {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		color: var(--ar-dim);
		margin-bottom: 2px;
	}

	.ar-activity-msg {
		color: var(--ar-text);
	}

	/* Keep scrollbars visible and subtle for independent scroll regions */
	.ar-scroll,
	.ar-dispatch-list,
	.ar-activity-list {
		scrollbar-width: thin;
		scrollbar-color: rgba(100, 116, 139, 0.55) transparent;
	}

	.ar-scroll::-webkit-scrollbar,
	.ar-dispatch-list::-webkit-scrollbar,
	.ar-activity-list::-webkit-scrollbar {
		width: 8px;
	}

	.ar-scroll::-webkit-scrollbar-thumb,
	.ar-dispatch-list::-webkit-scrollbar-thumb,
	.ar-activity-list::-webkit-scrollbar-thumb {
		background: rgba(100, 116, 139, 0.45);
		border-radius: 999px;
	}

	:global(.dark) .ar-scroll::-webkit-scrollbar-thumb,
	:global(.dark) .ar-dispatch-list::-webkit-scrollbar-thumb,
	:global(.dark) .ar-activity-list::-webkit-scrollbar-thumb,
	:global(html.dark) .ar-scroll::-webkit-scrollbar-thumb,
	:global(html.dark) .ar-dispatch-list::-webkit-scrollbar-thumb,
	:global(html.dark) .ar-activity-list::-webkit-scrollbar-thumb {
		background: rgba(148, 163, 184, 0.45);
	}

	.ar-footer {
		margin-top: auto;
		padding-top: 10px;
		border-top: 1px solid var(--ar-border-soft);
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex-shrink: 0;
	}

	.ar-btn {
		display: block;
		width: 100%;
		text-align: center;
		font-size: 12px;
		font-weight: 600;
		padding: 8px 11px;
		border-radius: 12px;
		text-decoration: none;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.ar-btn-primary {
		background: var(--ar-accent);
		color: #fff;
		border-color: rgba(15, 23, 42, 0.25);
	}

	.ar-btn-primary:hover {
		filter: brightness(1.06);
	}

	:global(.dark) .ar-btn-primary,
	:global(html.dark) .ar-btn-primary {
		background: linear-gradient(90deg, #22d3ee, #06b6d4);
		color: #082f49;
		border-color: rgba(34, 211, 238, 0.5);
	}

	:global(.dark) .ar-btn-primary:hover,
	:global(html.dark) .ar-btn-primary:hover {
		filter: brightness(1.04);
	}

	.ar-btn-stop {
		background: rgba(239, 68, 68, 0.1);
		color: var(--ar-red);
		border-color: rgba(239, 68, 68, 0.22);
	}

	.ar-btn-stop:hover {
		background: rgba(239, 68, 68, 0.16);
	}

	.ar-btn-secondary {
		background: var(--ar-card);
		color: var(--ar-muted);
		border-color: var(--ar-border-soft);
	}

	.ar-btn-secondary:hover {
		color: var(--ar-text);
		background: rgba(15, 23, 42, 0.04);
	}

	:global(.dark) .ar-btn-secondary:hover,
	:global(html.dark) .ar-btn-secondary:hover {
		background: rgba(255, 255, 255, 0.06);
	}
</style>
