<script lang="ts">
	import type { WorkspaceAction, WorkspaceStanding } from '#lib/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import ButtonGroup from '#lib/ui/ButtonGroup.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Props = {
		refreshing?: boolean;
		/** Where the workspace stands, in a few words. */
		standing: WorkspaceStanding | null;
		/** Its pull request, if it has one, to link to. */
		pull?: { number: string; url: string | null } | null;
		/** What could happen next, the most pressing first. */
		actions: WorkspaceAction[];
		/** The displayed actions belong to a branch that is no longer checked out. */
		disabled?: boolean;
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		/** Whether the agent is at work right now. */
		working?: boolean;
		/** Whether an agent has asked the person something, and waits for the answer. */
		asking?: boolean;
		onopenpull(): void;
		onaction(action: WorkspaceAction): void;
	};
	let {
		refreshing = false,
		standing,
		pull = null,
		actions,
		disabled = false,
		pending = [],
		working = false,
		asking = false,
		onopenpull,
		onaction
	}: Props = $props();

	const primary = $derived(actions.find((action) => !action.aside));
	// Keep priority in the action rules; put the main action at the right edge of the ribbon.
	const ordered = $derived([
		...actions.filter((action) => action !== primary),
		...(primary ? [primary] : [])
	]);

	const tones = {
		ok: 'bg-ok/12 text-ok',
		danger: 'bg-danger-soft text-danger',
		// something to do: quiet, like the rest; it is the next step that is in ink. Not in
		// gold, which is the reply box's (to send, and at work)
		accent: 'bg-sunken text-muted',
		merged: 'bg-merged/15 text-merged',
		neutral: 'bg-sunken text-muted'
	};
</script>

<!--
	Its pull request, as a quiet pill of its own before the rest: the way to it. Then where the workspace stands and what to do about it, as one
	unit: the standing colours the whole thing, and the first action is the next step. An
	agent at work says so at its head; an idle one says nothing.
-->
<div class="flex shrink-0 items-center gap-2">
	{#if refreshing}
		<span
			role="img"
			aria-label="Refreshing workspace"
			title="Refreshing workspace"
			class="icon-[lucide--loader-circle] size-4 shrink-0 text-muted motion-safe:animate-spin"
		></span>
	{/if}
	{#if pull}
		<div class="inline-flex h-9 shrink-0 items-stretch rounded-full bg-sunken text-muted">
			<button
				type="button"
				class={[
					'inline-flex items-center gap-1.5 rounded-full pl-3 text-sm leading-none font-medium tabular-nums hover:text-ink',
					pull.url ? 'pr-0.5' : 'pr-3'
				]}
				title={`Show pull request #${pull.number} in this workspace`}
				onclick={onopenpull}
			>
				<span class="icon-[lucide--git-pull-request] size-4"></span>
				<span>#{pull.number}</span>
			</button>
			{#if pull.url}
				<a
					href={pull.url}
					target="_blank"
					rel="external noreferrer"
					class="inline-flex items-center rounded-full pr-3 pl-1 hover:text-ink"
					aria-label={`Open pull request #${pull.number} in browser`}
					title="Open in browser"
				>
					<span class="icon-[lucide--external-link] size-4"></span>
				</a>
			{/if}
		</div>
	{/if}
	{#if standing || actions.length > 0 || working}
		<div
			role="group"
			aria-label="Next steps"
			class={[
				'inline-flex h-9 shrink-0 items-center gap-1',
				// with only buttons to show, they are the pill: no frame around them
				(standing || working) && [
					'rounded-full pl-3',
					// buttons reach the end of the pill; text keeps its distance
					actions.length > 0 ? 'pr-1' : 'pr-3',
					tones[standing?.tone ?? 'neutral']
				]
			]}
		>
			{#if working}
				<span class="flex items-center gap-2 text-sm font-medium whitespace-nowrap" role="status">
					{#if asking}
						<!-- at work, but not going on until it has heard from the person -->
						<span class="icon-[lucide--message-circle-question] size-4"></span>
						Waiting for your answer
					{:else}
						<Spinner />
						Working
					{/if}
				</span>
				{#if standing || actions.length > 0}
					<span class="mx-2 h-4 w-px shrink-0 bg-current opacity-25"></span>
				{/if}
			{/if}
			{#if standing}
				<span class={['size-4 shrink-0', standing.icon]}></span>
				<span class="pr-1.5 pl-1 text-sm font-medium whitespace-nowrap">{standing.label}</span>
			{/if}
			{#if ordered.length > 0}
				<!-- several ways to go are one pill, not several -->
				<ButtonGroup label="Actions">
					{#each ordered as action (action.id)}
						<!--
							The next step stands out; what else is possible, and what is beside it, doesn't.
							Filled where the way is clear (`ok`) or the work has landed (`merged`), in that
							colour. Resolve conflicts takes the ribbon colour; other next steps use ink. Never in gold: that is the one way to send a message.
						-->
						{@const next = action === primary}
						{@const filled = standing?.tone === 'ok' || standing?.tone === 'merged'}
						<Button
							size="sm"
							variant={next && filled ? 'primary' : 'soft'}
							tone={standing?.tone === 'merged' ? 'merged' : 'ok'}
							class={next && !filled && action.id !== 'resolve-conflicts' ? 'text-ink' : undefined}
							icon={action.icon}
							{disabled}
							busy={pending.includes(action.id)}
							onclick={() => onaction(action)}
						>
							{action.id === 'cancel-auto-merge' && standing?.label === 'Auto-merge enabled'
								? 'Disable'
								: action.label}
						</Button>
					{/each}
				</ButtonGroup>
			{/if}
		</div>
	{/if}
</div>
