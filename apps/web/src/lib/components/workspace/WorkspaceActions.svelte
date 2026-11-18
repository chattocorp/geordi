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
		/** The displayed actions belong to a branch that is no longer checked out. */
		disabled?: boolean;
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		/** Whether the agent is at work right now. */
		working?: boolean;
		/** Whether an agent has asked the person something, and waits for the answer. */
		asking?: boolean;
		/** Small, with only the next step: for showing many at once (the overview). */
		compact?: boolean;
		onopenpull(): void;
		onaction(action: WorkspaceAction): void;
	};
	let {
		standing,
		pull = null,
		actions,
		disabled = false,
		pending = [],
		working = false,
		asking = false,
		compact = false,
		onopenpull,
		onaction
	}: Props = $props();

	const primary = $derived(actions.find((action) => !action.aside));
	// Keep priority in the action rules; put the main action at the right edge of the ribbon.
	const ordered = $derived([
		...(compact ? [] : actions.filter((action) => action !== primary)),
		...(primary ? [primary] : [])
	]);
	const height = $derived(compact ? 'h-7' : 'h-9');
	const text = $derived(compact ? 'text-xs' : 'text-sm');
	const icon = $derived(compact ? 'size-3.5' : 'size-4');
	// small, beside a next step or "Working", the colour and icon of how it stands say enough
	const worded = $derived(!compact || (ordered.length === 0 && !working));
	const linked = $derived(!compact && !!pull?.url);

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
<div class={['flex items-center gap-2', compact ? 'min-w-0' : 'shrink-0']}>
	{#if pull}
		<div class={['inline-flex shrink-0 items-stretch rounded-full bg-sunken text-muted', height]}>
			<button
				type="button"
				class={[
					'inline-flex items-center gap-1.5 rounded-full leading-none font-medium tabular-nums hover:text-ink',
					text,
					compact ? 'pl-2.5' : 'pl-3',
					linked ? 'pr-0.5' : compact ? 'pr-2.5' : 'pr-3'
				]}
				title={`Show pull request #${pull.number} in this workspace`}
				onclick={onopenpull}
			>
				<span class={['icon-[lucide--git-pull-request]', icon]}></span>
				<span>#{pull.number}</span>
			</button>
			{#if linked && pull.url}
				<a
					href={pull.url}
					target="_blank"
					rel="external noreferrer"
					class={[
						'inline-flex items-center rounded-full pl-1 hover:text-ink',
						compact ? 'pr-2.5' : 'pr-3'
					]}
					aria-label={`Open pull request #${pull.number} in browser`}
					title="Open in browser"
				>
					<span class={['icon-[lucide--external-link]', icon]}></span>
				</a>
			{/if}
		</div>
	{/if}
	{#if standing || actions.length > 0 || working}
		<div
			role="group"
			aria-label="Next steps"
			class={[
				'inline-flex items-center gap-1',
				height,
				compact ? 'min-w-0' : 'shrink-0',
				// with only buttons to show, they are the pill: no frame around them
				(standing || working) && [
					'rounded-full',
					compact ? 'pl-2.5' : 'pl-3',
					// buttons reach the end of the pill; text keeps its distance
					ordered.length > 0 ? 'pr-1' : compact ? 'pr-2.5' : 'pr-3',
					tones[standing?.tone ?? 'neutral']
				]
			]}
		>
			{#if working}
				<span class={['flex items-center gap-2 font-medium whitespace-nowrap', text]} role="status">
					{#if asking}
						<!-- at work, but not going on until it has heard from the person -->
						<span class={['icon-[lucide--message-circle-question]', icon]}></span>
						Waiting for your answer
					{:else}
						<Spinner />
						Working
					{/if}
				</span>
				{#if standing || ordered.length > 0}
					<span class={['w-px shrink-0 bg-current opacity-25', compact ? 'mx-1 h-3' : 'mx-2 h-4']}
					></span>
				{/if}
			{/if}
			{#if standing}
				<span
					class={['shrink-0', icon, standing.icon, !worded && 'mr-1.5']}
					title={worded ? undefined : standing.label}
					role={worded ? undefined : 'img'}
					aria-label={worded ? undefined : standing.label}
				></span>
				{#if worded}
					<span
						class={[
							'pr-1.5 pl-1 font-medium whitespace-nowrap',
							text,
							compact && 'min-w-0 truncate'
						]}>{standing.label}</span
					>
				{/if}
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
