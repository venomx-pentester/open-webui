<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import Tooltip from '../common/Tooltip.svelte';
	import type { ShortcutDefinition } from '$lib/shortcuts';

	export let shortcut: ShortcutDefinition;
	export let isMac: boolean;

	const i18n = getContext('i18n');
	let keyboardLayoutMap: Map<string, string> | undefined;

	onMount(async () => {
		const keyboard = (navigator as any).keyboard;
		if (keyboard && 'getLayoutMap' in keyboard) {
			try {
				keyboardLayoutMap = await keyboard.getLayoutMap();
			} catch (error) {
				console.error('Failed to get keyboard layout map:', error);
			}
		}
	});

	function formatKey(key: string): string {
		switch (key.toLowerCase()) {
			case 'mod':
				return isMac ? 'Cmd' : 'Ctrl';
			case 'shift':
				return 'Shift';
			case 'alt':
				return isMac ? 'Option' : 'Alt';
			case 'backspace':
			case 'delete':
				return isMac ? 'Delete' : 'Del';
			case 'escape':
				return 'Esc';
			case 'enter':
				return 'Enter';
			case 'tab':
				return 'Tab';
			case 'arrowup':
				return 'Up';
			case 'arrowdown':
				return 'Down';
		}

		if (keyboardLayoutMap && keyboardLayoutMap.has(key)) {
			const mappedKey = keyboardLayoutMap.get(key) ?? key;
			return mappedKey.length === 1 ? mappedKey.toUpperCase() : mappedKey;
		}

		const lowerKey = key.toLowerCase();
		switch (lowerKey) {
			case 'quote':
				return "'";
			case 'period':
				return '.';
			case 'slash':
				return '/';
			case 'semicolon':
				return ';';
			default:
				if (lowerKey.startsWith('key') || lowerKey.startsWith('digit')) {
					return key.slice(-1).toUpperCase();
				}
				return key.toUpperCase();
		}
	}
</script>

<div class="w-full flex justify-between gap-3">
	<div class="text-sm whitespace-pre-line">
		{#if shortcut.tooltip}
			<Tooltip content={$i18n.t(shortcut.tooltip)}>
				<span class="whitespace-nowrap">
					{$i18n.t(shortcut.name)}<span class="text-xs" aria-hidden="true">&nbsp;*</span>
					<span class="sr-only"> {$i18n.t(shortcut.tooltip)}</span>
				</span>
			</Tooltip>
		{:else}
			{$i18n.t(shortcut.name)}
		{/if}
	</div>
	<div
		class="flex-shrink-0 flex justify-end self-start h-full space-x-1 text-xs"
		aria-hidden="true"
	>
		{#each shortcut.keys.filter((key) => !(key.toLowerCase() === 'delete' && shortcut.keys.includes('Backspace'))) as key}
			<kbd
				class="h-fit px-1 py-0.5 flex items-start justify-center rounded-sm border border-black/10 capitalize text-gray-600 dark:border-white/10 dark:text-gray-300"
			>
				{formatKey(key)}
			</kbd>
		{/each}
	</div>
	<span class="sr-only">
		{$i18n.t('Shortcut')}: {shortcut.keys.map(formatKey).join(' + ')}
	</span>
</div>
