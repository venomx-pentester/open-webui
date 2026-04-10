<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import {
		confirmPhase2,
		skipExploitation,
		setReviewed,
		getScanSessionForTarget
	} from '$lib/stores/scanSessions';
	import { resumeAgentRun } from '$lib/stores/agentRunnerStream';
	import { vxAction } from '$lib/utils/venomxDebug';

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
			vxAction('Phase2 Confirm', { targetId });
			const session = getScanSessionForTarget(targetId);
			let resumed = true;
			if (session?.agentRunId) {
				resumed = await resumeAgentRun(session.agentRunId);
			}
			if (!resumed) {
				return;
			}
			confirmPhase2(targetId);
			dispatch('close');
		} else {
			vxAction('Phase2 Review (dismiss)', { targetId });
			setReviewed(targetId);
			dispatch('close');
		}
	};

	const skip = () => {
		vxAction('Phase2 Skip exploitation', { targetId });
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
	class="fixed inset-0 z-[200] bg-slate-950/45 dark:bg-black/60 backdrop-blur-sm animate-fade-in"
	on:click|self={() => {
		setReviewed(targetId);
		dispatch('close');
	}}
></div>

<!-- Card centered -->
<div class="fixed inset-0 z-[201] grid place-items-center p-4 md:p-6 pointer-events-none">
	<div
		class="pointer-events-auto w-full max-w-[680px] rounded-2xl border border-slate-200/80 dark:border-slate-800/70 bg-white/95 dark:bg-slate-950/92 backdrop-blur-xl shadow-2xl overflow-hidden animate-slide-up"
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/70"
		>
			<div
				class="text-[22px] leading-tight font-semibold tracking-tight text-slate-900 dark:text-slate-100"
			>
				Phase 1 complete — proceed with exploitation?
			</div>
			<button
				class="w-7 h-7 rounded-md grid place-items-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors text-[14px]"
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
					class="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
						{i > 0 ? 'border-t border-slate-200/70 dark:border-slate-800/65' : ''}
						{selected === i
						? 'bg-cyan-50/70 dark:bg-cyan-900/12'
						: 'hover:bg-slate-50/70 dark:hover:bg-slate-900/35'}"
					on:click={() => act(i)}
					on:mouseenter={() => (selected = i)}
				>
					<!-- Number badge -->
					<div
						class="w-[26px] h-[26px] rounded-md grid place-items-center font-mono text-[12px] font-semibold flex-shrink-0 border transition-colors
							{selected === i
							? 'bg-cyan-100/85 dark:bg-cyan-900/25 border-cyan-300/70 dark:border-cyan-700/45 text-cyan-700 dark:text-cyan-300'
							: 'bg-slate-100/90 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}"
					>
						{i + 1}
					</div>

					<!-- Content -->
					<div class="flex-1 min-w-0">
						<div
							class="text-[16px] md:text-[17px] leading-6 font-semibold tracking-tight text-slate-900 dark:text-slate-100"
						>
							{opt.label}
						</div>
						<div
							class="text-[13px] md:text-[14px] mt-0.5 transition-colors leading-6 md:leading-5
								{selected === i ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}"
						>
							{opt.desc}
						</div>
					</div>

					<!-- Arrow -->
					<div
						class="text-[16px] transition-opacity
							{selected === i ? 'opacity-100 text-cyan-600 dark:text-cyan-300' : 'opacity-0'}"
					>
						→
					</div>
				</div>
			{/each}
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800/65 bg-slate-50/70 dark:bg-slate-900/50"
		>
			<div class="font-mono text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
				↑↓ navigate<span class="mx-1.5 opacity-40">·</span>Enter select<span
					class="mx-1.5 opacity-40">·</span
				>Esc dismiss
			</div>
			<button
				class="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/65 hover:text-slate-800 dark:hover:text-slate-100 transition"
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
