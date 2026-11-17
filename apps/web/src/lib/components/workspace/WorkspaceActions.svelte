<script lang="ts">
	import type { WorkspaceAction, WorkspaceStanding } from '#lib/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import ButtonGroup from '#lib/ui/ButtonGroup.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Props = {
		/** Where the workspace stands, in a few words. */
		standing: WorkspaceStanding | null;
		/** Its pull request, if it has one, to link to. */
		pull?: { number: string; url: string | null } | null;
		/** What could happen next, the most pressing first. */
		actions: WorkspaceAction[];
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		/** Whether the agent is at work right now. */
		working?: boolean;
		/**
		 * How it stands is being found out right now (or again): what was known may no longer
		 * be so, and is not shown, nor offered to act on, until it is.
		 */
		checking?: boolean;
		onaction(action: WorkspaceAction): void;
	};
	let {
		standing,
		pull = null,
		actions,
		pending = [],
		working = false,
		checking = false,
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
	{#if pull}
		<svelte:element
			this={pull.url ? 'a' : 'span'}
			href={pull.url}
			target="_blank"
			rel="noreferrer"
			class={[
				'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 code-dense',
				// always quiet: it is a way to somewhere, and how things stand is said next to it
				tones.neutral,
				pull.url && 'hover:text-ink'
			]}
			title="Open the pull request"
		>
			<span class="icon-[lucide--git-pull-request] size-4"></span>
			#{pull.number}
			{#if pull.url}<span class="icon-[lucide--external-link] size-3.5 opacity-70"></span>{/if}
		</svelte:element>
	{/if}
	{#if checking && !working}
		<div
			role="status"
			class={['inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3', tones.neutral]}
		>
			<Spinner label="Checking" />
			<span class="text-sm font-medium whitespace-nowrap">Checking</span>
		</div>
	{:else if standing || actions.length > 0 || working}
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
					<Spinner />
					Working
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
							colour; otherwise in ink. Never in gold: that is the one way to send a message.
						-->
						{@const next = action === primary}
						{@const filled = standing?.tone === 'ok' || standing?.tone === 'merged'}
						<Button
							size="sm"
							variant={next && filled ? 'primary' : 'soft'}
							tone={standing?.tone === 'merged' ? 'merged' : 'ok'}
							class={next && !filled ? 'text-ink' : undefined}
							icon={action.icon}
							busy={pending.includes(action.id)}
							onclick={() => onaction(action)}
						>
							{action.label}
						</Button>
					{/each}
				</ButtonGroup>
			{/if}
		</div>
	{/if}
</div>
