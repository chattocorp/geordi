<script module lang="ts">
	type Channel = 'latest' | 'beta' | 'alpha';
	export type UpdateState = {
		channel: Channel;
		ready: string | null;
		status: 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'installing' | 'error';
		busy: boolean;
	};
	export type UpdateControls = {
		setChannel(value: Channel): void;
		check(): void;
		restart(): void;
	};
	export type UpdateBridge = UpdateControls & {
		subscribe(callback: (state: UpdateState | null) => void): () => void;
	};
</script>

<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import Segmented from '@geordi/ui/Segmented.svelte';
	let { state, controls }: { state: UpdateState; controls: UpdateControls } = $props();
	const messages = {
		idle: 'Geordi checks automatically every hour.',
		checking: 'Checking for updates…',
		current: 'Geordi is up to date.',
		downloading: 'Downloading an update…',
		ready: '',
		installing: 'Restarting Geordi…',
		error: 'Update failed. See the desktop log for details.'
	};
</script>

<section class="mt-8 space-y-4" aria-label="Software updates">
	<h3 class="heading">Software updates</h3>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-sm font-medium">Release channel</p>
		<fieldset disabled={state.busy}>
			<Segmented
				label="Release channel"
				options={[
					{ value: 'latest', label: 'Stable' },
					{ value: 'beta', label: 'Beta' },
					{ value: 'alpha', label: 'Alpha' }
				]}
				bind:value={() => state.channel, (value) => controls.setChannel(value)}
			/>
		</fieldset>
	</div>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p role="status" class="text-sm text-muted">
			{state.status === 'ready'
				? `Version ${state.ready} is ready to install.`
				: messages[state.status]}
		</p>
		{#if state.ready}
			<Button variant="primary" busy={state.busy} onclick={controls.restart}>
				Restart to update
			</Button>
		{:else}
			<Button busy={state.busy} onclick={controls.check}>Check for updates</Button>
		{/if}
	</div>
	{#if state.ready}<p class="text-xs text-muted">
			Restarting closes terminals and stops running jobs. Agent turns continue.
		</p>{/if}
</section>
