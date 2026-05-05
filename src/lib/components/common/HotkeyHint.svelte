<script lang="ts">
	import { onMount } from 'svelte';
	import { shortcuts } from '$lib/shortcuts';

	export let name: string;
	export let className = '';

	let isMac = false;
	let mounted = false;
	let keys: string[] = [];
	let isVisible = true;

	onMount(() => {
		isMac = /Mac/i.test(navigator.userAgent);
		keys = shortcuts[name]?.keys ?? [];
		mounted = true;
	});

	function formatKey(key: string): string {
		const lowerKey = key.toLowerCase();

		if (lowerKey === 'mod') return isMac ? 'Cmd' : 'Ctrl';
		if (lowerKey === 'shift') return 'Shift';
		if (lowerKey === 'slash') return '/';
		if (lowerKey === 'period') return '.';
		if (lowerKey === 'quote') return "'";
		if (lowerKey === 'semicolon') return ';';
		if (lowerKey.startsWith('key') || lowerKey.startsWith('digit')) return key.slice(-1);

		return key;
	}
</script>

{#if mounted && isVisible}
	<div
		class="hidden md:flex items-center self-center text-xs text-gray-400 dark:text-gray-600 {className}"
		aria-hidden="true"
	>
		<span>{keys.map(formatKey).join('+')}</span>
	</div>
{/if}
