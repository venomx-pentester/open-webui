<script lang="ts">
	import { getContext } from 'svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import {
		OFFICIAL_SLASH_COMMANDS,
		type OfficialSlashCommand
	} from '$lib/components/chat/MessageInput/Commands/slashCommands';

	const i18n = getContext('i18n');

	export let query = '';
	export let onSelect = (e) => {};

	let selectedIdx = 0;
	export let filteredItems: OfficialSlashCommand[] = [];

	$: {
		const normalized = query.trim().toLowerCase();
		filteredItems = OFFICIAL_SLASH_COMMANDS.filter((item) => {
			if (!normalized) return true;

			return (
				item.command.toLowerCase().includes(normalized) ||
				item.description.toLowerCase().includes(normalized) ||
				item.usage.toLowerCase().includes(normalized)
			);
		});
	}

	$: if (query) {
		selectedIdx = 0;
	}

	export const selectUp = () => {
		selectedIdx = Math.max(0, selectedIdx - 1);
	};

	export const selectDown = () => {
		selectedIdx = Math.min(selectedIdx + 1, filteredItems.length - 1);
	};

	export const select = async () => {
		const item = filteredItems[selectedIdx];
		if (item) {
			onSelect({ type: 'slash-command', data: item });
		}
	};
</script>

<div class="px-2 text-xs text-gray-500 py-1">
	{$i18n.t('Official Commands')}
</div>

{#if filteredItems.length > 0}
	<div class="space-y-0.5 scrollbar-hidden">
		{#each filteredItems as item, idx}
			<Tooltip content={item.description} placement="top-start">
				<button
					class="px-3 py-1.5 rounded-xl w-full text-left {idx === selectedIdx
						? 'bg-gray-50 dark:bg-gray-800 selected-command-option-button'
						: ''}"
					type="button"
					on:click={() => {
						onSelect({ type: 'slash-command', data: item });
					}}
					on:mousemove={() => {
						selectedIdx = idx;
					}}
					on:focus={() => {}}
					data-selected={idx === selectedIdx}
				>
					<div class="font-medium text-black dark:text-gray-100">{item.command}</div>
					<div class="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-1">
						{item.description}
					</div>
				</button>
			</Tooltip>
		{/each}
	</div>
{/if}
