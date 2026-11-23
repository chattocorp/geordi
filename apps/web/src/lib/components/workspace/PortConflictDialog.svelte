<script lang="ts">
	import type { PortConflict } from '@geordi/protocol';
	import Button from '@geordi/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';

	let {
		conflict,
		cancel,
		retry
	}: {
		conflict: (PortConflict & { job: string }) | null;
		cancel: () => void;
		retry: () => void;
	} = $props();
</script>

<Dialog
	bind:open={() => !!conflict, (open) => !open && cancel()}
	label="Port {conflict?.port} is in use"
	class="max-w-md"
>
	{#if conflict}
		<div class="space-y-4 p-6">
			<h2 class="heading">Port {conflict.port} is in use</h2>
			<p class="text-sm text-prose">
				{#if conflict.listener}
					<span class="code-dense">{conflict.listener.name}</span> (PID {conflict.listener.pid}) is
					listening on the port that {conflict.job} needs.
				{:else}
					{conflict.job} needs this port. Geordi could not identify a single listening process.
				{/if}
				{#if !conflict.confirmation}Free the port, then try again.{/if}
			</p>
			{#if conflict.problem}<p class="text-sm text-danger">{conflict.problem}</p>{/if}
			<div class="dialog-actions">
				<Button onclick={cancel}>Cancel</Button>
				<Button variant="primary" onclick={retry}>
					{conflict.confirmation ? 'Stop process and retry' : 'Retry'}
				</Button>
			</div>
		</div>
	{/if}
</Dialog>
