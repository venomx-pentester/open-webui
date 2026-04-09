<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import type { NewTargetInput, TargetType } from './types';

	const i18n = getContext<any>('i18n');
	const dispatch = createEventDispatcher<{ submit: NewTargetInput }>();

	export let show = false;

	const defaultForm: NewTargetInput = {
		name: '',
		type: 'Domain',
		value: '',
		description: ''
	};

	let form: NewTargetInput = { ...defaultForm };

	$: if (show) {
		form = { ...defaultForm };
	}

	const targetTypes: TargetType[] = ['Domain', 'IP', 'URL', 'CIDR', 'Host'];

	const submitHandler = () => {
		dispatch('submit', {
			name: form.name.trim(),
			type: form.type,
			value: form.value.trim(),
			description: form.description.trim()
		});
		show = false;
	};
</script>

<Modal size="sm" bind:show>
	<div class="target-modal-shell">
		<div
			class="flex justify-between dark:text-gray-200 px-5 pt-5 pb-3 border-b border-slate-200/80 dark:border-slate-800/60"
		>
			<div>
				<div class="text-lg font-semibold self-center tracking-tight">{$i18n.t('Add Target')}</div>
				<div class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-5">
					{$i18n.t('Capture a host, IP, URL, or other asset before you queue a scan.')}
				</div>
			</div>
			<button
				class="self-center rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
				aria-label={$i18n.t('Close')}
				on:click={() => {
					show = false;
				}}
			>
				<XMark className="size-5" />
			</button>
		</div>

		<form class="px-5 pb-5 text-sm" on:submit|preventDefault={submitHandler}>
			<div class="flex flex-col gap-3.5">
				<div>
					<div
						class="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						{$i18n.t('Name')}
					</div>
					<input
						class="target-input w-full text-sm md:text-[15px] leading-6 rounded-xl px-3 py-2.5 outline-hidden"
						type="text"
						bind:value={form.name}
						placeholder={$i18n.t('Production API Surface')}
						required
					/>
				</div>

				<div>
					<div
						class="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						{$i18n.t('Type')}
					</div>
					<select
						class="target-input w-full rounded-xl text-sm md:text-[15px] leading-6 px-3 py-2.5 outline-hidden"
						bind:value={form.type}
					>
						{#each targetTypes as type}
							<option value={type}>{type}</option>
						{/each}
					</select>
				</div>

				<div>
					<div
						class="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						{$i18n.t('Value')}
					</div>
					<input
						class="target-input w-full text-sm md:text-[15px] leading-6 rounded-xl px-3 py-2.5 outline-hidden"
						type="text"
						bind:value={form.value}
						placeholder={$i18n.t('api.example.com')}
						required
					/>
				</div>

				<div>
					<div
						class="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
					>
						{$i18n.t('Description')}
					</div>
					<textarea
						class="target-input w-full text-sm md:text-[15px] leading-6 rounded-xl px-3 py-2.5 outline-hidden resize-none"
						bind:value={form.description}
						rows="3"
						placeholder={$i18n.t('Optional context for this target asset')}
					></textarea>
				</div>
			</div>

			<div class="mt-4 flex justify-end gap-2.5">
				<button
					type="button"
					class="px-3.5 py-2 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 dark:bg-slate-800/70 dark:hover:bg-slate-700/80 transition font-medium"
					on:click={() => {
						show = false;
					}}
				>
					{$i18n.t('Cancel')}
				</button>
				<button
					type="submit"
					class="px-3.5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition font-semibold"
				>
					{$i18n.t('Add Target')}
				</button>
			</div>
		</form>
	</div>
</Modal>

<style>
	.target-modal-shell {
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 24px;
		box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
		backdrop-filter: blur(16px);
	}

	:global(.dark) .target-modal-shell {
		background: rgba(15, 23, 42, 0.92);
		border-color: rgba(51, 65, 85, 0.78);
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.38);
	}

	.target-input {
		background: rgba(255, 255, 255, 0.86);
		border: 1px solid rgba(148, 163, 184, 0.32);
		color: rgb(15, 23, 42);
	}

	:global(.dark) .target-input {
		background: rgba(15, 23, 42, 0.62);
		border-color: rgba(51, 65, 85, 0.85);
		color: rgb(226, 232, 240);
	}
</style>
