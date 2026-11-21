<script lang="ts">
	import type { WorkspaceAction, WorkspaceStanding } from './actions.ts';
	import QuestionLink from './QuestionLink.svelte';
	import Button from './Button.svelte';
	import ButtonGroup from './ButtonGroup.svelte';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	type Props = {
		/** Where the workspace stands, in a few words. */
		standing: WorkspaceStanding | null;
		/** Its pull request, if it has one, to link to. */
		pull?: { number: string; url: string | null } | null;
		/** What could happen next, the most pressing first. */
		actions: WorkspaceAction[];
		/**
		 * Why the forge could not be asked how the pull request stands, if it could not: what
		 * is shown is then what was last known.
		 */
		unreachable?: string | null;
		/** The displayed actions belong to a branch that is no longer checked out. */
		disabled?: boolean;
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		/** The workspace with a question waiting for an answer. */
		askingIn?: string;
		/** Small, with only the next step: for showing many at once. */
		compact?: boolean;
		onopenpull(): void;
		onaction(action: WorkspaceAction): void;
	};
	let {
		standing,
		pull = null,
		actions,
		unreachable = null,
		disabled = false,
		pending = [],
		askingIn,
		compact = false,
		onopenpull,
		onaction
	}: Props = $props();

	const primary = $derived(actions.find((action) => !action.aside));
	// Compact ribbons show the next step. Full ribbons lead with Sync whenever it is available.
	const ordered = $derived.by(() => {
		if (compact) return primary ? [primary] : [];
		const sync = actions.find((action) => action.id === 'merge-upstream');
		return [
			...(sync ? [sync] : []),
			...actions.filter((action) => action !== sync && action !== primary),
			...(primary && primary !== sync ? [primary] : [])
		];
	});
	const text = $derived(compact ? 'text-xs' : 'text-sm');
	const icon = $derived(compact ? 'size-3.5' : 'size-4');
	// small, beside a next step or a question, the colour and icon of how it stands say enough
	const worded = $derived(!compact || (ordered.length === 0 && !askingIn));
	// In compact ribbons the question icon fits beside the next step.
	const showQuestionLabel = $derived(!compact || ordered.length === 0);
	const linked = $derived(!compact && !!pull?.url);

	// What changes in the ribbon arrives: it fades in, rising a little. Not on first render.
	const arrive = () => ({
		y: 4,
		duration: prefersReducedMotion.current ? 0 : 320,
		easing: cubicOut
	});

	const tones = {
		ok: 'status-ok',
		danger: 'status-danger',
		// something to do: quiet, like the rest; it is the next step that is in ink. Not in
		// gold, which is the reply box's (to send, and at work)
		accent: 'bg-sunken text-muted',
		merged: 'status-merged',
		neutral: 'bg-sunken text-muted'
	};
</script>

<!--
	Its pull request, as a quiet pill of its own before the rest: the way to it. Then where the workspace stands and what to do about it, as one
	unit: the standing colours the whole thing, and the first action is the next step. A
	question appears at its head while an agent waits for an answer.
-->
<div class={['flex max-w-full flex-wrap items-center gap-2', compact && 'min-w-0 flex-1']}>
	{#if unreachable && !compact}
		{@const label = `The forge cannot be reached, so this is how things stood when it last could. (${unreachable})`}
		<span
			class="icon-[lucide--cloud-off] size-4 shrink-0 text-muted"
			role="img"
			aria-label={label}
			title={label}
			in:fly={arrive()}
		></span>
	{/if}
	{#if pull}
		<div
			class="inline-flex h-9 shrink-0 items-stretch rounded-full bg-sunken text-muted"
			in:fly={arrive()}
		>
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
				<span class="@max-md/titlebar:sr-only">#{pull.number}</span>
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
	{#if standing || ordered.length > 0 || askingIn}
		<!-- a new standing or next step is a new ribbon -->
		{#key `${standing?.label}|${primary?.id}`}
			<div
				in:fly={arrive()}
				role="group"
				aria-label="Next steps"
				class={[
					// as tall when small: the pill frames its buttons (`h-7`) all round
					'inline-flex min-h-9 max-w-full flex-wrap items-center gap-1 rounded-full py-1',
					'shrink-0',
					text,
					standing || askingIn ? (compact ? 'pl-2.5' : 'pl-3') : 'pl-1',
					// buttons reach the end of the pill; text keeps its distance
					ordered.length > 0 ? 'pr-1' : compact ? 'pr-2.5' : 'pr-3',
					tones[standing?.tone ?? 'neutral']
				]}
			>
				{#if askingIn}
					<QuestionLink workspaceHref={askingIn} worded={showQuestionLabel} />
					{#if standing || ordered.length > 0}
						<span class={['w-px shrink-0 bg-current opacity-25', compact ? 'mx-1 h-3' : 'mx-2 h-4']}
						></span>
					{/if}
				{/if}
				{#if standing}
					{#snippet status()}
						<span class={['shrink-0', icon, standing.icon]}></span>
						{#if worded}
							<span class="@max-2xl/titlebar:sr-only">{standing.label}</span>
						{/if}
					{/snippet}
					{#if standing.hint && !compact}
						<a
							href={standing.hint.href}
							target="_blank"
							rel="external noreferrer"
							title={standing.hint.text}
							class="inline-flex items-center gap-2 pr-1.5 font-medium whitespace-nowrap underline decoration-current/40 decoration-dotted underline-offset-4 hover:text-ink"
							>{@render status()}</a
						>
					{:else}
						<span
							class="inline-flex items-center gap-2 pr-1.5 font-medium whitespace-nowrap"
							title={standing.label}
							role={worded ? undefined : 'img'}
							aria-label={worded ? undefined : standing.label}>{@render status()}</span
						>
					{/if}
				{/if}
				{#if ordered.length > 0}
					<!-- several ways to go are one pill, not several -->
					<ButtonGroup label="Actions">
						{#each ordered as action (action.id)}
							<!--
							The next step is filled where the way is clear (`ok`) or the work has landed
							(`merged`), in that colour. Every other button takes the ribbon's colour; on a
							quiet ribbon, ink, so that all read alike.
						-->
							{@const busy = pending.includes(action.id)}
							{@const next = action === primary}
							{@const quiet =
								!standing || standing.tone === 'neutral' || standing.tone === 'accent'}
							{@const filled = standing?.tone === 'ok' || standing?.tone === 'merged'}
							<Button
								size="sm"
								variant={next && filled ? 'primary' : 'soft'}
								tone={standing?.tone === 'merged' ? 'merged' : 'ok'}
								class={['@max-md/titlebar:size-7 @max-md/titlebar:p-0', quiet && 'text-ink']}
								label={action.label}
								title={action.unavailable ?? action.label}
								icon={action.icon}
								disabled={disabled || !!action.unavailable}
								{busy}
								onclick={() => onaction(action)}
							>
								<span class="@max-md/titlebar:sr-only">{action.label}</span>
								{#if action.incomingCommits !== undefined}
									<span class="font-normal tabular-nums opacity-60 @max-md/titlebar:sr-only"
										>{action.incomingCommits}</span
									>
									<span class="sr-only"
										>incoming {action.incomingCommits === 1 ? 'commit' : 'commits'}</span
									>
								{/if}
							</Button>
						{/each}
					</ButtonGroup>
				{/if}
			</div>
		{/key}
	{/if}
</div>
