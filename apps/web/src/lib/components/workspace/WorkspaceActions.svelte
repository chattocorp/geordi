<script lang="ts">
	import type { WorkspaceAction, WorkspaceStanding } from '#lib/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import ButtonGroup from '#lib/ui/ButtonGroup.svelte';

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
	const text = $derived(compact ? 'text-xs' : 'text-sm');
	const icon = $derived(compact ? 'size-3.5' : 'size-4');
	// small, beside a next step or a question, the colour and icon of how it stands say enough
	const worded = $derived(!compact || (ordered.length === 0 && !asking));
	// In compact ribbons the question icon fits beside the next step.
	const showQuestionLabel = $derived(!compact || ordered.length === 0);
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
	unit: the standing colours the whole thing, and the first action is the next step. A
	question appears at its head while an agent waits for an answer.
-->
<div class={['flex items-center gap-2', compact ? 'min-w-0 flex-1 flex-wrap' : 'shrink-0']}>
	{#if pull}
		<div class={['inline-flex h-9 shrink-0 items-stretch rounded-full bg-sunken text-muted']}>
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
	{#if standing || ordered.length > 0 || asking}
		<div
			role="group"
			aria-label="Next steps"
			class={[
				// as tall when small: the pill frames its buttons (`h-7`) all round
				'inline-flex h-9 items-center gap-1 rounded-full',
				// never narrower than what is in it: on a card it moves to a line of its own
				'shrink-0',
				compact ? 'pl-2.5' : 'pl-3',
				// buttons reach the end of the pill; text keeps its distance
				ordered.length > 0 ? 'pr-1' : compact ? 'pr-2.5' : 'pr-3',
				tones[standing?.tone ?? 'neutral']
			]}
		>
			{#if asking}
				<span class={['flex items-center gap-2 font-medium whitespace-nowrap', text]} role="status">
					<span
						class={['icon-[lucide--message-circle-question]', icon]}
						title={showQuestionLabel ? undefined : 'Waiting for your answer'}
						role={showQuestionLabel ? undefined : 'img'}
						aria-label={showQuestionLabel ? undefined : 'Waiting for your answer'}
					></span>
					{#if showQuestionLabel}Waiting for your answer{/if}
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
					<span class={['pr-1.5 pl-1 font-medium whitespace-nowrap', text]}>{standing.label}</span>
				{/if}
			{/if}
			{#if ordered.length > 0}
				<!-- several ways to go are one pill, not several -->
				<ButtonGroup label="Actions">
					{#each ordered as action (action.id)}
						<!--
							The next step stands out; what else is possible, and what is beside it, doesn't.
							Filled where the way is clear (`ok`) or the work has landed (`merged`), in that
							colour. On a ribbon that says something is wrong, it takes the ribbon's colour too.
							Other soft next steps use ink.
						-->
						{@const busy = pending.includes(action.id)}
						{@const next = action === primary}
						{@const ribbonColor = standing?.tone === 'danger'}
						{@const filled = standing?.tone === 'ok' || standing?.tone === 'merged'}
						<Button
							size="sm"
							variant={next && filled ? 'primary' : 'soft'}
							tone={standing?.tone === 'merged' ? 'merged' : 'ok'}
							class={next && !filled && !ribbonColor ? 'text-ink' : undefined}
							icon={action.icon}
							{disabled}
							{busy}
							onclick={() => onaction(action)}
						>
							{action.label}
							{#if action.incomingCommits !== undefined}
								<span class="font-normal tabular-nums opacity-60">{action.incomingCommits}</span>
								<span class="sr-only"
									>incoming {action.incomingCommits === 1 ? 'commit' : 'commits'}</span
								>
							{/if}
						</Button>
					{/each}
				</ButtonGroup>
			{/if}
		</div>
	{/if}
</div>
