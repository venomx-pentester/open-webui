<script lang="ts">
	import { getContext, onDestroy } from 'svelte';

	import { scanSessions, type ScanStageStatus } from '$lib/stores/scanSessions';
	import { activeTarget } from '$lib/stores/targets';

	export let targetId: string | null = null;
	export let title = 'Scan Progress';

	const i18n = getContext<any>('i18n');

	let nowTick = Date.now();
	const timerId = setInterval(() => {
		nowTick = Date.now();
	}, 1000);

	onDestroy(() => {
		clearInterval(timerId);
	});

	$: activeSession = targetId ? ($scanSessions[targetId] ?? null) : null;
	$: selectedTargetName =
		activeSession?.targetName ??
		($activeTarget && targetId && $activeTarget.id === targetId ? $activeTarget.name : null);

	$: stageLabel =
		activeSession?.stages.find((stage) => stage.id === activeSession.currentStageId)?.label ??
		activeSession?.currentStageId ??
		'-';

	$: elapsedMs = activeSession ? (activeSession.endedAt ?? nowTick) - activeSession.startedAt : 0;

	$: recentActivity = activeSession?.activity
		? [...activeSession.activity].reverse().slice(0, 6)
		: [];
	$: progressPercent = Math.max(0, Math.min(100, Math.floor(activeSession?.progress ?? 0)));

	const statusBadgeClass = (status: ScanStageStatus) => {
		if (status === 'complete') {
			return 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/45';
		}

		if (status === 'in_progress') {
			return 'text-sky-700 dark:text-sky-300 bg-sky-100/80 dark:bg-sky-900/45';
		}

		if (status === 'error') {
			return 'text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-900/45';
		}

		return 'text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80';
	};

	const lifecycleLabel = (value: string) => {
		if (value === 'running') {
			return 'Running';
		}
		if (value === 'paused') {
			return 'Paused';
		}
		if (value === 'complete') {
			return 'Complete';
		}
		if (value === 'error') {
			return 'Error';
		}
		return 'Queued';
	};

	const formatElapsed = (milliseconds: number) => {
		const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const pad = (value: number) => value.toString().padStart(2, '0');

		if (hours > 0) {
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
		}

		return `${pad(minutes)}:${pad(seconds)}`;
	};

	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		const pad = (value: number) => value.toString().padStart(2, '0');
		return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	};
</script>

<div
	class="scan-panel rounded-2xl border border-slate-200/80 dark:border-slate-800/65 bg-white/82 dark:bg-slate-950/60 backdrop-blur-md shadow-sm p-4"
>
	<div class="flex items-start justify-between gap-2">
		<div>
			<div class="text-base font-semibold tracking-tight">{$i18n.t(title)}</div>
			<div class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-5">
				{selectedTargetName ?? $i18n.t('Select a target to view scan progress')}
			</div>
		</div>
		{#if activeSession}
			<div
				class="scan-pill text-[11px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap leading-none {statusBadgeClass(
					activeSession.lifecycle === 'queued'
						? 'pending'
						: activeSession.lifecycle === 'running'
							? 'in_progress'
							: activeSession.lifecycle === 'paused'
								? 'pending'
								: activeSession.lifecycle === 'complete'
									? 'complete'
									: 'error'
				)}"
			>
				{lifecycleLabel(activeSession.lifecycle)}
			</div>
		{/if}
	</div>

	{#if activeSession}
		<div class="mt-4 space-y-3.5">
			<div>
				<div
					class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1.5"
				>
					<span>{$i18n.t('Overall Progress')}</span>
					<span>{progressPercent}%</span>
				</div>
				<div class="h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-800/75 overflow-hidden">
					<div
						class="h-full bg-slate-900 dark:bg-slate-100 transition-all duration-500"
						style={`width: ${progressPercent}%`}
					></div>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-2 text-xs">
				<div
					class="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/45 p-2.5"
				>
					<div class="text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wide">
						{$i18n.t('Current Stage')}
					</div>
					<div class="font-medium mt-1 line-clamp-1 text-slate-700 dark:text-slate-100">
						{stageLabel}
					</div>
				</div>
				<div
					class="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/45 p-2.5"
				>
					<div class="text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wide">
						{$i18n.t('Elapsed')}
					</div>
					<div class="font-medium mt-1 text-slate-700 dark:text-slate-100">
						{formatElapsed(elapsedMs)}
					</div>
				</div>
			</div>

			<div>
				<div
					class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2"
				>
					{$i18n.t('Stages')}
				</div>
				<div class="space-y-1.5 max-h-44 overflow-y-auto scrollbar-hidden pr-1">
					{#each activeSession.stages as stage}
						<div
							class="flex items-center justify-between text-xs rounded-lg border border-slate-200/75 dark:border-slate-800/55 px-2.5 py-2 bg-white/65 dark:bg-slate-900/35"
						>
							<div class="line-clamp-1">{stage.label}</div>
							<div
								class="px-2 py-0.5 rounded-full font-medium capitalize {statusBadgeClass(
									stage.status
								)}"
							>
								{stage.status.replace('_', ' ')}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div>
				<div
					class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2"
				>
					{$i18n.t('Recent Activity')}
				</div>
				<div class="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hidden pr-1">
					{#if recentActivity.length > 0}
						{#each recentActivity as item}
							<div
								class="text-xs rounded-lg border border-slate-200/75 dark:border-slate-800/55 px-2.5 py-2 bg-white/65 dark:bg-slate-900/35"
							>
								<div class="text-slate-500 dark:text-slate-400 text-[11px]">
									{formatTime(item.timestamp)}
								</div>
								<div class="mt-1 leading-5 text-slate-700 dark:text-slate-200">{item.message}</div>
							</div>
						{/each}
					{:else}
						<div class="text-xs text-slate-500 dark:text-slate-400 leading-5">
							{$i18n.t('No activity recorded yet.')}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div
			class="mt-3 text-sm text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200/75 dark:border-slate-800/55 bg-white/65 dark:bg-slate-900/35 p-3 leading-6"
		>
			{$i18n.t('Queue a scan from Targets or the sidebar to start a mock scan lifecycle.')}
		</div>
	{/if}
</div>

<style>
	.scan-panel {
		backdrop-filter: blur(14px);
	}

	:global(.dark) .scan-panel {
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
			0 14px 32px rgba(0, 0, 0, 0.22);
	}

	.scan-pill {
		text-transform: none;
	}
</style>
