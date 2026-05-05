<script lang="ts">
	import { getContext } from 'svelte';
	import { WEBUI_NAME } from '$lib/stores';
	import Search from '$lib/components/icons/Search.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import AddTargetModal from './Targets/AddTargetModal.svelte';
	import NetworkTopology from './Targets/NetworkTopology.svelte';
	import ScanProgressPanel from './Targets/ScanProgressPanel.svelte';
	import TargetCard from './Targets/TargetCard.svelte';
	import VulnerabilityDashboard from './Targets/VulnerabilityDashboard.svelte';
	import type { TargetStatus, TargetType } from './Targets/types';
	import {
		activeTargetId,
		addTarget,
		deleteTarget,
		queueTargetScan,
		setActiveTarget,
		startScanQueue,
		targets,
		toggleTargetStatus
	} from '$lib/stores/targets';

	const i18n = getContext<any>('i18n');

	let showAddTargetModal = false;
	let query = '';
	let typeFilter: 'all' | TargetType = 'all';
	let statusFilter: 'all' | TargetStatus = 'all';

	const targetTypes: Array<'all' | TargetType> = ['all', 'Domain', 'IP', 'URL', 'CIDR', 'Host'];
	const statusOptions: Array<'all' | TargetStatus> = [
		'all',
		'Active',
		'Pending',
		'Paused',
		'Complete',
		'Error'
	];

	$: filteredTargets = $targets.filter((target) => {
		const lowerQuery = query.trim().toLowerCase();
		const matchesQuery =
			lowerQuery === '' ||
			target.name.toLowerCase().includes(lowerQuery) ||
			target.value.toLowerCase().includes(lowerQuery) ||
			target.description.toLowerCase().includes(lowerQuery);

		const matchesType = typeFilter === 'all' || target.type === typeFilter;
		const matchesStatus = statusFilter === 'all' || target.status === statusFilter;

		return matchesQuery && matchesType && matchesStatus;
	});
</script>

<svelte:head>
	<title>{$i18n.t('Targets')} - {$WEBUI_NAME}</title>
</svelte:head>

<AddTargetModal
	bind:show={showAddTargetModal}
	on:submit={(event) => {
		addTarget(event.detail);
	}}
/>

<div class="flex flex-col gap-4 px-1 mt-1.5 mb-3">
	<div class="targets-shell px-4 py-4 md:px-5 md:py-5">
		<div class="flex justify-between items-start gap-3 flex-wrap">
			<div class="min-w-0">
				<div class="flex items-center gap-3 shrink-0">
					<div
						class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
					>
						{$i18n.t('Target Workspace')}
					</div>
					<div class="h-px flex-1 bg-slate-200/80 dark:bg-slate-800/80"></div>
				</div>
				<div class="mt-2 flex items-baseline gap-2">
					<div class="text-xl md:text-2xl font-semibold tracking-tight">{$i18n.t('Targets')}</div>
					<div class="text-base font-medium text-slate-500 dark:text-slate-400">
						{filteredTargets.length}
					</div>
				</div>
				<div
					class="mt-2 text-sm md:text-[15px] leading-6 text-slate-600 dark:text-slate-300 max-w-3xl"
				>
					{$i18n.t('Manage assets under assessment and monitor active scan progress.')}
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition font-medium text-sm shadow-sm"
					on:click={() => {
						showAddTargetModal = true;
					}}
				>
					<Plus className="size-3.5" strokeWidth="2.5" />
					<span>{$i18n.t('Add Target')}</span>
				</button>
			</div>
		</div>
	</div>

	<div class="targets-shell targets-shell--dense">
		<div class="px-3.5 pt-3 pb-2.5">
			<ScanProgressPanel targetId={$activeTargetId} title="Scan Progress" />
		</div>

		<div class="px-3.5 pb-3.5 grid grid-cols-1 2xl:grid-cols-2 gap-3.5">
			<NetworkTopology targetId={$activeTargetId} />
			<VulnerabilityDashboard targetId={$activeTargetId} />
		</div>

		<div class="px-3.5 flex flex-col gap-3.5 pb-3.5">
			<div
				class="flex items-center w-full space-x-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/70 bg-white/82 dark:bg-slate-900/55 px-3 py-2.5"
			>
				<div class="self-center text-slate-500 dark:text-slate-400">
					<Search className="size-4" />
				</div>
				<input
					class="w-full text-sm md:text-[15px] leading-6 py-0.5 outline-hidden bg-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
					bind:value={query}
					placeholder={$i18n.t('Search targets by name, value, or description')}
					aria-label={$i18n.t('Search Targets')}
				/>
				{#if query}
					<button
						type="button"
						class="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
						aria-label={$i18n.t('Clear search')}
						on:click={() => {
							query = '';
						}}
					>
						<XMark className="size-3.5" strokeWidth="2" />
					</button>
				{/if}
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 px-0.5">
				<div>
					<label
						for="target-type-filter"
						class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
					>
						{$i18n.t('Type')}
					</label>
					<select
						id="target-type-filter"
						class="targets-select w-full text-sm md:text-[15px] outline-hidden rounded-lg px-3 py-2"
						bind:value={typeFilter}
					>
						{#each targetTypes as option}
							<option value={option}>{option === 'all' ? $i18n.t('All Types') : option}</option>
						{/each}
					</select>
				</div>
				<div>
					<label
						for="target-status-filter"
						class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
					>
						{$i18n.t('Status')}
					</label>
					<select
						id="target-status-filter"
						class="targets-select w-full text-sm md:text-[15px] outline-hidden rounded-lg px-3 py-2"
						bind:value={statusFilter}
					>
						{#each statusOptions as option}
							<option value={option}>{option === 'all' ? $i18n.t('All Statuses') : option}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	</div>

	{#if filteredTargets.length > 0}
		<div class="my-2 px-3 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
			{#each filteredTargets as target (target.id)}
				<TargetCard
					{target}
					on:run={(event) => {
						setActiveTarget(event.detail);
						queueTargetScan(event.detail);
						startScanQueue();
					}}
					on:toggle={(event) => {
						toggleTargetStatus(event.detail);
					}}
					on:delete={(event) => {
						deleteTarget(event.detail);
					}}
				/>
			{/each}
		</div>
	{:else}
		<div class="w-full h-full flex flex-col justify-center items-center my-16 mb-24 px-4">
			<div
				class="max-w-md text-center rounded-lg border border-dashed border-slate-200/80 dark:border-slate-800/65 bg-white/60 dark:bg-slate-900/35 px-6 py-8"
			>
				<div class="text-lg font-semibold mb-1.5">{$i18n.t('No targets found')}</div>
				<div class="text-sm leading-6 text-slate-500 dark:text-slate-400 text-center">
					{$i18n.t('Try adjusting your search or filter, or add a new target asset.')}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.targets-shell {
		border: 1px solid rgba(148, 163, 184, 0.26);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.84);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.72) inset,
			0 10px 26px rgba(15, 23, 42, 0.06);
		backdrop-filter: blur(16px);
	}

	:global(.dark) .targets-shell {
		border-color: rgba(51, 65, 85, 0.8);
		background: rgba(15, 23, 42, 0.62);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
			0 12px 30px rgba(0, 0, 0, 0.28);
	}

	.targets-shell--dense {
		padding-top: 0.25rem;
	}

	.targets-select {
		background: rgba(255, 255, 255, 0.82);
		border: 1px solid rgba(148, 163, 184, 0.28);
		color: rgb(15, 23, 42);
	}

	:global(.dark) .targets-select {
		background: rgba(15, 23, 42, 0.58);
		border-color: rgba(51, 65, 85, 0.8);
		color: rgb(226, 232, 240);
	}
</style>
