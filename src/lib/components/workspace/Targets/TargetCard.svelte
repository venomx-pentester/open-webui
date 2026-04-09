<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import type { Target } from './types';
	import { getTargetStatusClass } from './status';

	const i18n = getContext<any>('i18n');
	const dispatch = createEventDispatcher<{ run: string; toggle: string; delete: string }>();

	export let target: Target;
</script>

<div
	class="target-card rounded-2xl border border-slate-200/80 dark:border-slate-800/65 bg-white/86 dark:bg-slate-950/60 p-4 shadow-sm transition hover:shadow-md"
>
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<div class="text-[15px] font-semibold tracking-tight line-clamp-1">{target.name}</div>
			<div class="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-5">
				{target.description || $i18n.t('No description')}
			</div>
		</div>
		<div
			class="text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-wide uppercase {getTargetStatusClass(
				target.status
			)}"
		>
			{target.status}
		</div>
	</div>

	<div class="mt-4 grid grid-cols-2 gap-y-2.5 text-sm">
		<div class="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">
			{$i18n.t('Type')}
		</div>
		<div class="text-right font-medium text-slate-700 dark:text-slate-200">{target.type}</div>

		<div class="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">
			{$i18n.t('Value')}
		</div>
		<div class="text-right line-clamp-1 text-slate-700 dark:text-slate-200" title={target.value}>
			{target.value}
		</div>

		<div class="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">
			{$i18n.t('Last Scan')}
		</div>
		<div class="text-right text-xs text-slate-600 dark:text-slate-300">
			{target.lastScan ?? $i18n.t('Never')}
		</div>
	</div>

	<div class="mt-4 flex items-center justify-end gap-2">
		<button
			class="text-xs px-3 py-2 rounded-xl bg-slate-100/85 hover:bg-slate-200/85 dark:bg-slate-800/70 dark:hover:bg-slate-700/80 transition font-medium"
			on:click={() => {
				dispatch('toggle', target.id);
			}}
		>
			{target.status === 'Paused' ? $i18n.t('Resume') : $i18n.t('Pause')}
		</button>
		<button
			class="text-xs px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition font-medium"
			on:click={() => {
				dispatch('run', target.id);
			}}
		>
			{$i18n.t('Queue Scan')}
		</button>
		<button
			class="text-xs px-3 py-2 rounded-xl bg-rose-50/90 text-rose-700 hover:bg-rose-100/90 dark:bg-rose-900/35 dark:text-rose-300 dark:hover:bg-rose-900/50 transition font-medium"
			on:click={() => {
				dispatch('delete', target.id);
			}}
		>
			{$i18n.t('Delete')}
		</button>
	</div>
</div>

<style>
	.target-card {
		backdrop-filter: blur(14px);
	}

	:global(.dark) .target-card:hover {
		background: rgba(15, 23, 42, 0.72);
	}
</style>
