<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { getS4Notifications, type S4NotificationItem } from '$lib/apis/admin/guard';

	let notifications: S4NotificationItem[] = [];
	let selected: S4NotificationItem | null = null;
	let loading = true;
	let error = '';
	let limit = 50;

	const loadNotifications = async () => {
		loading = true;
		error = '';

		try {
			notifications = await getS4Notifications(localStorage.token, limit);
			selected =
				notifications.find((item) => item.guard_id === selected?.guard_id) ??
				notifications[0] ??
				null;
		} catch (err: any) {
			error =
				typeof err === 'string' ? err : (err?.message ?? 'Unable to load S4 guard notifications.');
			toast.error(error);
		} finally {
			loading = false;
		}
	};

	const formatDate = (value: string | null | undefined) => {
		if (!value) return 'Unknown';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString();
	};

	const promptPreview = (value: string | null | undefined) => {
		const content = value?.trim() ?? '';
		if (!content) return 'No prompt content captured.';
		return content.length > 140 ? `${content.slice(0, 140)}...` : content;
	};

	const riskLabel = (item: S4NotificationItem) =>
		item.intent_label?.trim() || item.category || 'S4';

	const timelineFor = (item: S4NotificationItem) => [
		{
			title: 'User prompt received',
			body: `Chat ${item.chat_id ?? 'unknown'} recorded a user prompt for account ${item.user_id ?? 'unknown'}.`
		},
		{
			title: 'Guard classified prompt',
			body: `Guard check ${item.guard_id} classified the request as ${riskLabel(item)}.`
		},
		{
			title: 'Prompt blocked',
			body: 'The proxy returned the VenomX guard block response instead of sending the prompt through the pentest flow.'
		},
		{
			title: 'Admin notification captured',
			body: `The incident was written to the admin notification stream at ${formatDate(item.created_at)}.`
		}
	];

	$: criticalCount = notifications.length;
	$: uniqueUsers = new Set(notifications.map((item) => item.user_id).filter(Boolean)).size;
	$: uniqueChats = new Set(notifications.map((item) => item.chat_id).filter(Boolean)).size;

	onMount(loadNotifications);
</script>

<div class="flex flex-col w-full h-full px-4 pb-4 gap-4">
	<header class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
		<div>
			<div class="text-lg font-semibold text-gray-900 dark:text-gray-100">S4 Guard Review</div>
			<div class="text-sm text-gray-500 dark:text-gray-400">
				Review blocked guard events and the account/chat context that led to the flag.
			</div>
		</div>

		<div class="flex items-center gap-2">
			<label class="text-xs text-gray-500 dark:text-gray-400" for="s4-limit">Limit</label>
			<select
				id="s4-limit"
				class="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-800 dark:bg-gray-900"
				bind:value={limit}
				on:change={loadNotifications}
			>
				<option value={25}>25</option>
				<option value={50}>50</option>
				<option value={100}>100</option>
				<option value={200}>200</option>
			</select>
			<button
				type="button"
				class="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
				on:click={loadNotifications}
				disabled={loading}
			>
				{loading ? 'Loading...' : 'Refresh'}
			</button>
		</div>
	</header>

	<section class="grid grid-cols-1 gap-2 md:grid-cols-3" aria-label="S4 guard summary">
		<div class="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
			<div class="text-xs uppercase text-gray-500 dark:text-gray-400">Blocked prompts</div>
			<div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
				{criticalCount}
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
			<div class="text-xs uppercase text-gray-500 dark:text-gray-400">Users flagged</div>
			<div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{uniqueUsers}</div>
		</div>
		<div class="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
			<div class="text-xs uppercase text-gray-500 dark:text-gray-400">Chats involved</div>
			<div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{uniqueChats}</div>
		</div>
	</section>

	{#if error}
		<div
			class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
			role="alert"
		>
			{error}
		</div>
	{/if}

	<div
		class="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]"
	>
		<section
			class="min-h-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
			aria-label="S4 notifications"
		>
			<div class="border-b border-gray-200 px-3 py-2 text-sm font-medium dark:border-gray-800">
				Recent S4 Events
			</div>

			<div class="max-h-[58vh] overflow-y-auto">
				{#if loading}
					<div class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
						Loading guard events...
					</div>
				{:else if notifications.length === 0}
					<div class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
						No S4 guard events found.
					</div>
				{:else}
					{#each notifications as item (item.guard_id)}
						<button
							type="button"
							class="w-full border-b border-gray-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-gray-50 dark:border-gray-850 dark:hover:bg-gray-900 {selected?.guard_id ===
							item.guard_id
								? 'bg-gray-50 dark:bg-gray-900'
								: ''}"
							aria-pressed={selected?.guard_id === item.guard_id}
							on:click={() => (selected = item)}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
										{item.user_id ?? 'Unknown user'}
									</div>
									<div class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
										Chat {item.chat_id ?? 'unknown'} - {formatDate(item.created_at)}
									</div>
								</div>
								<span
									class="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-200"
								>
									{riskLabel(item)}
								</span>
							</div>
							<div class="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
								{promptPreview(item.prompt_content)}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</section>

		<section
			class="min-h-0 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800"
			aria-label="Selected S4 event details"
		>
			{#if selected}
				<div class="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
					<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div>
							<div class="text-base font-semibold text-gray-900 dark:text-gray-100">
								Guard Check {selected.guard_id}
							</div>
							<div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								{formatDate(selected.created_at)}
							</div>
						</div>
						{#if selected.chat_id}
							<a
								class="w-fit rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
								href={`/c/${selected.chat_id}`}
							>
								Open chat
							</a>
						{/if}
					</div>
				</div>

				<div
					class="grid grid-cols-1 gap-3 border-b border-gray-200 p-4 text-sm dark:border-gray-800 md:grid-cols-2"
				>
					<div>
						<div class="text-xs uppercase text-gray-500 dark:text-gray-400">User account</div>
						<div class="mt-1 break-all font-medium text-gray-900 dark:text-gray-100">
							{selected.user_id ?? 'Unknown'}
						</div>
					</div>
					<div>
						<div class="text-xs uppercase text-gray-500 dark:text-gray-400">Chat ID</div>
						<div class="mt-1 break-all font-medium text-gray-900 dark:text-gray-100">
							{selected.chat_id ?? 'Unknown'}
						</div>
					</div>
					<div>
						<div class="text-xs uppercase text-gray-500 dark:text-gray-400">Session ID</div>
						<div class="mt-1 break-all font-medium text-gray-900 dark:text-gray-100">
							{selected.session_id ?? 'Unknown'}
						</div>
					</div>
					<div>
						<div class="text-xs uppercase text-gray-500 dark:text-gray-400">Intent label</div>
						<div class="mt-1 break-all font-medium text-gray-900 dark:text-gray-100">
							{riskLabel(selected)}
						</div>
					</div>
				</div>

				<div class="border-b border-gray-200 p-4 dark:border-gray-800">
					<div class="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
						Prompt Content
					</div>
					<pre
						class="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-200">{selected.prompt_content?.trim() ||
							'No prompt content captured.'}</pre>
				</div>

				<div class="p-4">
					<div class="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">Event Chain</div>
					<ol class="space-y-3">
						{#each timelineFor(selected) as step, index}
							<li class="flex gap-3">
								<div
									class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
								>
									{index + 1}
								</div>
								<div>
									<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
										{step.title}
									</div>
									<div class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{step.body}</div>
								</div>
							</li>
						{/each}
					</ol>
				</div>
			{:else}
				<div class="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
					Select an S4 guard event to review the account and chat chain.
				</div>
			{/if}
		</section>
	</div>
</div>
