<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { confirmPhase2, skipExploitation, setReviewed, getScanSessionForTarget } from '$lib/stores/scanSessions';
	import { resumeAgentRun } from '$lib/stores/agentRunnerStream';

	export let targetId: string;

	const dispatch = createEventDispatcher();
	let selected = 0;

	const options = [
		{
			label: 'Confirm Phase 2',
			desc: 'Proceed with active exploitation against discovered services'
		},
		{
			label: 'Review findings first',
			desc: 'Dismiss this dialog and review the activity log before deciding'
		}
	];

	const act = async (index: number) => {
		if (index === 0) {
			const session = getScanSessionForTarget(targetId);
			if (session?.agentRunId) {
				await resumeAgentRun(session.agentRunId);
			}
			confirmPhase2(targetId);
			dispatch('close');
		} else {
			setReviewed(targetId);
			dispatch('close');
		}
	};

	const skip = () => {
		skipExploitation(targetId);
		dispatch('close');
	};

	const handleKeydown = async (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = (selected + 1) % options.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = (selected - 1 + options.length) % options.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			await act(selected);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setReviewed(targetId);
			dispatch('close');
		} else if (e.key === '1' || e.key === '2') {
			e.preventDefault();
			await act(parseInt(e.key) - 1);
		}
	};

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
	});
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="fixed inset-0 z-[200] bg-black/40 dark:bg-black/55 backdrop-blur-sm animate-fade-in"
	on:click|self={() => {
		setReviewed(targetId);
		dispatch('close');
	}}
></div>

<!-- Card anchored near bottom -->
<div class="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-[201] w-[540px] max-w-[90vw]">
	<div
		class="w-full rounded-2xl border border-sky-100/80 dark:border-sky-900/55 bg-white/95 dark:bg-slate-950/90 backdrop-blur-xl shadow-2xl overflow-hidden animate-slide-up"
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between px-3.5 py-2.5 border-b border-sky-100/70 dark:border-sky-900/45"
		>
			<div class="text-[13px] font-semibold">
				Phase 1 complete — proceed with exploitation?
			</div>
			<button
				class="w-6 h-6 rounded-md grid place-items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-[13px]"
				on:click={() => {
					setReviewed(targetId);
					dispatch('close');
				}}
			>
				✕
			</button>
		</div>

		<!-- Options -->
		<div>
			{#each options as opt, i}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div
					class="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors
						{i > 0 ? 'border-t border-sky-100/50 dark:border-sky-900/35' : ''}
						{selected === i
						? 'bg-blue-50/60 dark:bg-blue-900/10'
						: 'hover:bg-slate-50/60 dark:hover:bg-slate-900/20'}"
					on:click={() => act(i)}
					on:mouseenter={() => (selected = i)}
				>
					<!-- Number badge -->
					<div
						class="w-[22px] h-[22px] rounded-md grid place-items-center font-mono text-[11px] font-semibold flex-shrink-0 border transition-colors
							{selected === i
							? 'bg-blue-100/80 dark:bg-blue-900/25 border-blue-300/60 dark:border-blue-700/40 text-blue-600 dark:text-blue-400'
							: 'bg-slate-100/80 dark:bg-slate-800/60 border-sky-100/70 dark:border-sky-900/40 text-gray-400 dark:text-gray-500'}"
					>
						{i + 1}
					</div>

					<!-- Content -->
					<div class="flex-1 min-w-0">
						<div class="text-[13px] font-medium">{opt.label}</div>
						<div
							class="text-[11px] mt-0.5 transition-colors
								{selected === i
								? 'text-gray-500 dark:text-gray-400'
								: 'text-gray-400 dark:text-gray-500'}"
						>
							{opt.desc}
						</div>
					</div>

					<!-- Arrow -->
					<div
						class="text-[13px] transition-opacity
							{selected === i
							? 'opacity-100 text-blue-500 dark:text-blue-400'
							: 'opacity-0'}"
					>
						→
					</div>
				</div>
			{/each}
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-3.5 py-2 border-t border-sky-100/70 dark:border-sky-900/45 bg-slate-50/60 dark:bg-black/15"
		>
			<div
				class="font-mono text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1"
			>
				↑↓ navigate<span class="mx-1.5 opacity-40">·</span>Enter select<span
					class="mx-1.5 opacity-40">·</span
				>Esc dismiss
			</div>
			<button
				class="text-[11px] font-medium px-3 py-1 rounded-md border border-sky-100/70 dark:border-sky-900/45 text-gray-500 dark:text-gray-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-gray-700 dark:hover:text-gray-200 transition"
				on:click={skip}
			>
				Skip
			</button>
		</div>
	</div>
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	.animate-fade-in {
		animation: fade-in 0.15s ease-out;
	}
	.animate-slide-up {
		animation: slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}
</style>
