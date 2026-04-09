<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowPath from '$lib/components/icons/ArrowPath.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import {
		scanSessions,
		confirmPhase2,
		skipExploitation,
		type DispatchEntry
	} from '$lib/stores/scanSessions';
	import { activeRunTargetId, reconnectAgentStream } from '$lib/stores/agentRunnerStream';
	import { activeQueueTargetId, activeTargetId } from '$lib/stores/targets';

	const i18n = getContext<any>('i18n');
	export let onClose: () => void = () => {};

	let elapsedDisplay = '00:00';
	let elapsedInterval: ReturnType<typeof setInterval> | null = null;

	const fmtElapsed = (ms: number) => {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
	};

	$: resolvedTargetId =
		$activeRunTargetId ?? $activeQueueTargetId ?? $activeTargetId;
	$: session = resolvedTargetId ? $scanSessions[resolvedTargetId] ?? null : null;
	$: isRunning = session?.lifecycle === 'running';
	$: isPaused = session?.lifecycle === 'paused';
	$: isComplete = session?.lifecycle === 'complete';
	$: isError = session?.lifecycle === 'error';
	$: hasSession = session !== null;
	$: doneCount = session?.dispatches.filter((d) => d.status === 'done').length ?? 0;
	$: totalCount = session?.dispatches.length ?? 0;
	$: dispatchLine =
		totalCount === 0
			? 'Dispatch pipeline — pending'
			: `${doneCount}/${totalCount} specialists`;
	$: recentActivity = session ? [...session.activity].reverse().slice(0, 24) : [];

	$: shortSessionRef = session?.id ? `${session.id.slice(0, 8)}…` : '';

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

	const activityBorderClass = (msg: string): string => {
		const m = msg.toLowerCase();
		if (msg.includes('Running ')) return 'ar-act-tool';
		if (msg.includes('completed') || msg.includes(' OK')) return 'ar-act-ok';
		if (msg.includes('failed') || m.includes('error')) return 'ar-act-err';
		if (msg.includes('Dispatching')) return 'ar-act-dispatch';
		if (msg.includes('Phase') || msg.includes('confirmation')) return 'ar-act-phase';
		return 'ar-act-info';
	};
</script>

<!-- Panel styled to match mockups/sidebar-demo.html (instrument column, not generic chat chrome) -->
<aside
	class="agent-runner-panel h-full w-72 max-w-[18rem] flex flex-col overflow-y-auto scrollbar-hidden"
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
					Phase {session.phase || 1}{session.phase === 2 ? ' — Exploitation' : ' — Reconnaissance'}
				{:else}
					{$i18n.t('No active run')}
				{/if}
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
							'Requires a run ID — appears in chat when the agent run is acknowledged'
						)}
				disabled={!session?.agentRunId}
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
				Send <code class="ar-empty-code">/pentest &lt;target&gt;</code> in chat to start a penetration test
				run.
			</p>
		</div>
	{:else if session}
		<div class="ar-scroll flex flex-col flex-1 min-h-0 gap-2.5">
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
						{isComplete ? 'Complete' : isError ? 'Error' : isPaused ? 'Awaiting Confirm' : 'Running'}
					</span>
					<span class="ar-badge ar-badge-phase">Phase {session.phase || 1}</span>
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
						<div class="ar-banner-sub">{session.errorMessage ?? 'An unexpected error occurred.'}</div>
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
				<div class="ar-section-label">Live Activity</div>
				<div class="ar-activity-list">
					{#each recentActivity as item (item.id)}
						<div class="ar-activity-item {activityBorderClass(item.message)}">
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
			{/if}
		</div>
	{/if}

	<!-- Footer -->
	<div class="ar-footer">
		{#if isRunning}
			<button type="button" class="ar-btn ar-btn-stop">
				{$i18n.t('Stop Run')}
			</button>
		{/if}

		{#if isPaused && session?.reviewed && resolvedTargetId}
			<button
				type="button"
				class="ar-btn ar-btn-primary"
				on:click={() => confirmPhase2(resolvedTargetId)}
			>
				{$i18n.t('Confirm Phase 2')}
			</button>
			<button
				type="button"
				class="ar-btn ar-btn-stop"
				on:click={() => skipExploitation(resolvedTargetId)}
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
	/* Tokens aligned with mockups/sidebar-demo.html — cool blue-tinted instrument panel */
	.agent-runner-panel {
		--ar-border: rgba(56, 113, 194, 0.22);
		--ar-border-soft: rgba(56, 113, 194, 0.14);
		--ar-bg: rgba(15, 17, 23, 0.82);
		--ar-card: rgba(20, 24, 33, 0.72);
		--ar-text: #e2e8f0;
		--ar-muted: #8896ab;
		--ar-dim: #5a6578;
		--ar-accent: #3b82f6;
		--ar-accent-glow: rgba(59, 130, 246, 0.12);
		--ar-cyan: #06b6d4;
		--ar-green: #22c55e;
		--ar-amber: #f59e0b;
		--ar-red: #ef4444;
		--ar-violet: #a78bfa;

		padding: 10px;
		border-radius: 16px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-bg);
		backdrop-filter: blur(20px) saturate(1.35);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
			0 12px 40px rgba(0, 0, 0, 0.35);
		color: var(--ar-text);
	}

	:global(.light) .agent-runner-panel,
	:global(html:not(.dark)) .agent-runner-panel {
		--ar-border: rgba(56, 113, 194, 0.2);
		--ar-border-soft: rgba(56, 113, 194, 0.12);
		--ar-bg: rgba(255, 255, 255, 0.78);
		--ar-card: rgba(248, 250, 252, 0.92);
		--ar-text: #0f172a;
		--ar-muted: #64748b;
		--ar-dim: #94a3b8;
		--ar-accent-glow: rgba(59, 130, 246, 0.08);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.8) inset,
			0 8px 28px rgba(15, 23, 42, 0.08);
	}

	.ar-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 2px 10px;
		border-bottom: 1px solid var(--ar-border-soft);
	}

	.ar-title-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ar-title {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ar-text);
	}

	.ar-meta {
		font-size: 11px;
		color: var(--ar-muted);
		margin-top: 2px;
		line-height: 1.35;
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
		width: 28px;
		height: 28px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--ar-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.ar-icon-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--ar-text);
	}

	.ar-icon-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	:global(.light) .ar-icon-btn:hover:not(:disabled),
	:global(html:not(.dark)) .ar-icon-btn:hover:not(:disabled) {
		background: rgba(15, 23, 42, 0.06);
	}

	.ar-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 32px 16px;
		gap: 12px;
	}

	.ar-empty-icon {
		font-size: 32px;
		opacity: 0.28;
		line-height: 1;
	}

	.ar-empty-copy {
		font-size: 12px;
		color: var(--ar-dim);
		max-width: 220px;
		line-height: 1.55;
	}

	.ar-empty-code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 6px;
		border: 1px solid var(--ar-border-soft);
		background: rgba(0, 0, 0, 0.2);
	}

	:global(.light) .ar-empty-code,
	:global(html:not(.dark)) .ar-empty-code {
		background: rgba(241, 245, 249, 0.95);
	}

	.ar-scroll {
		padding-top: 2px;
	}

	.ar-run-card {
		margin-top: 6px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.ar-run-target {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 13px;
		font-weight: 600;
		color: var(--ar-cyan);
		line-height: 1.3;
		word-break: break-all;
	}

	.ar-badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.ar-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 3px 8px;
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
		font-size: 10px;
		color: var(--ar-dim);
		word-break: break-all;
		line-height: 1.35;
	}

	.ar-run-id-muted {
		color: var(--ar-muted);
		font-style: italic;
	}

	.ar-session-ref {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 9px;
		color: var(--ar-dim);
		opacity: 0.85;
	}

	.ar-banner {
		margin-top: 8px;
		padding: 8px 10px;
		border-radius: 10px;
		font-size: 11px;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		line-height: 1.45;
	}

	.ar-banner-ic {
		font-size: 14px;
		line-height: 1;
		margin-top: 1px;
		flex-shrink: 0;
	}

	.ar-banner-title {
		font-weight: 700;
		margin-bottom: 2px;
	}

	.ar-banner-sub {
		font-size: 10px;
		color: var(--ar-muted);
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
		font-size: 11px;
		color: var(--ar-muted);
		margin-bottom: 5px;
	}

	.ar-progress-pct {
		font-variant-numeric: tabular-nums;
	}

	.ar-track {
		height: 6px;
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
		background: linear-gradient(90deg, #3b82f6, #06b6d4);
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
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
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
		font-size: 10px;
		color: var(--ar-muted);
		margin-top: 6px;
		line-height: 1.45;
	}

	.ar-hint-code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 9px;
		padding: 0 3px;
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.2);
	}

	:global(.light) .ar-hint-code,
	:global(html:not(.dark)) .ar-hint-code {
		background: rgba(241, 245, 249, 1);
	}

	.ar-stat-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		margin-top: 8px;
	}

	.ar-stat-card {
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
	}

	.ar-stat-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ar-dim);
	}

	.ar-stat-value {
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		margin-top: 3px;
		color: var(--ar-text);
	}

	.ar-section-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--ar-muted);
		margin: 10px 0 6px 2px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.ar-dispatch-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.ar-dispatch {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 10px;
		border: 1px solid var(--ar-border-soft);
		background: var(--ar-card);
		font-size: 11px;
		min-height: 32px;
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
		width: 18px;
		height: 18px;
		border-radius: 6px;
		display: grid;
		place-items: center;
		font-size: 10px;
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
	}

	.ar-dispatch-detail {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 10px;
		color: var(--ar-dim);
	}

	.ar-dispatch-nodes {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		color: var(--ar-green);
		flex-shrink: 0;
	}

	.ar-dispatch-empty {
		border-radius: 12px;
		border: 1px dashed var(--ar-border-soft);
		background: rgba(59, 130, 246, 0.04);
		padding: 10px 12px;
		font-size: 10px;
		color: var(--ar-muted);
		line-height: 1.45;
	}

	.ar-activity-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: min(40vh, 320px);
		overflow-y: auto;
		padding-bottom: 4px;
	}

	.ar-activity-item {
		padding: 5px 8px;
		border-radius: 8px;
		font-size: 10px;
		line-height: 1.45;
		border-left: 2px solid transparent;
	}

	.ar-act-tool {
		border-left-color: var(--ar-accent);
		background: rgba(59, 130, 246, 0.06);
	}
	.ar-act-ok {
		border-left-color: var(--ar-green);
		background: rgba(34, 197, 94, 0.05);
	}
	.ar-act-err {
		border-left-color: var(--ar-red);
		background: rgba(239, 68, 68, 0.06);
	}
	.ar-act-dispatch {
		border-left-color: var(--ar-violet);
		background: rgba(139, 92, 246, 0.06);
	}
	.ar-act-phase {
		border-left-color: var(--ar-amber);
		background: rgba(245, 158, 11, 0.06);
	}
	.ar-act-info {
		border-left-color: var(--ar-dim);
		background: rgba(148, 163, 184, 0.06);
	}

	.ar-activity-time {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 9px;
		color: var(--ar-dim);
		margin-bottom: 1px;
	}

	.ar-activity-msg {
		color: var(--ar-muted);
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
		font-size: 11px;
		font-weight: 600;
		padding: 8px 12px;
		border-radius: 10px;
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
	}

	.ar-btn-primary:hover {
		filter: brightness(1.06);
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
		background: rgba(255, 255, 255, 0.04);
	}

	:global(.light) .ar-btn-secondary:hover,
	:global(html:not(.dark)) .ar-btn-secondary:hover {
		background: rgba(15, 23, 42, 0.04);
	}
</style>
