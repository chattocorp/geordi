<script lang="ts">
	import type { ForgeDiagnostic } from '@geordi/protocol';
	import Button from '@geordi/ui/Button.svelte';
	import { FORGE_SETUP_URL } from '@geordi/ui/actions';
	import { problemOf } from '#lib/problem.ts';

	let { check }: { check: () => Promise<ForgeDiagnostic> } = $props();
	let busy = $state(false);
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

<Button variant="ghost" size="sm" icon="icon-[lucide--unplug]" {busy} onclick={run}>
	Check forge access
</Button>
<div role="status">
	{#if result}
		<div class="space-y-1 py-2 text-sm">
			{#if result.context}<p class="font-medium break-words">{result.context}</p>{/if}
			<p class="text-muted">{result.message}</p>
			{#if result.setup}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- the setup guide is an external URL -->
				<a class="text-accent-ink underline" href={FORGE_SETUP_URL} target="_blank" rel="noreferrer"
					>Forge setup guide</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	{/if}
</div>
