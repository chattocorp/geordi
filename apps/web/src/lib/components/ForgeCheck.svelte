<script lang="ts">
	import { onMount } from 'svelte';
	import type { ForgeDiagnostic } from '@geordi/protocol';
	import Button from '@geordi/ui/Button.svelte';
	import { FORGE_SETUP_URL } from '@geordi/ui/actions';
	import { problemOf } from '#lib/problem.ts';

	let { check }: { check: () => Promise<ForgeDiagnostic> } = $props();
	let busy = $state(true);
	onMount(() => {
		void run();
	});
	let result = $state<ForgeDiagnostic>();

	async function run() {
		busy = true;
		result = undefined;
		try {
			result = await check();
		} catch (error) {
			result = { message: problemOf(error, 'Could not contact the daemon. Try again.') };
		} finally {
			busy = false;
		}
	}
</script>

<div class="rounded-control bg-surface px-4 py-3">
	<div class="flex items-center justify-between gap-3">
		<h3 class="text-sm font-medium">{result?.title ?? 'Forge access'}</h3>
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--refresh-cw]"
			label="Check forge access again"
			{busy}
			onclick={run}
		/>
	</div>
	<div role="status" class="space-y-1 text-sm">
		{#if busy}
			<p class="text-muted">Checking access…</p>
		{:else if result}
			{#if result.context}<p class="break-words text-muted">{result.context}</p>{/if}
			<p class="max-w-prose text-prose">{result.message}</p>
			{#if result.setup}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- the setup guide is an external URL -->
				<a
					class="mt-2 inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline"
					href={FORGE_SETUP_URL}
					target="_blank"
					rel="noreferrer"
					>Forge setup guide <span class="icon-[lucide--arrow-up-right] size-3.5 text-muted"
					></span></a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		{/if}
	</div>
</div>
