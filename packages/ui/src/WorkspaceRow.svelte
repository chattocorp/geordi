<script lang="ts">
	import type { Snippet } from 'svelte';
	import WorkspaceActivity from './WorkspaceActivity.svelte';
	import type { ActivityId, WorkspaceAction, WorkspaceStanding } from './actions.ts';
	import RowLabel from './RowLabel.svelte';

	import QuestionLink from './QuestionLink.svelte';
	import StandingIcon from './StandingIcon.svelte';
	import StatusIcon from './StatusIcon.svelte';

	let {
		title,
		href,
		parentTitle,
		parentHref,
		icon,
		current = false,
		leaving = false,
		dragging = false,
		highlighted = false,
		unread = false,
		asking = false,
		waiting = false,
		working = false,
		locked = false,
		inactive = false,
		progress,
		standing = null,
		actions = [],
		fold,
		onaction,
		foldAside = false,
		wrap = false
	}: {
		title: string;
		href?: string;
		parentTitle?: string;
		parentHref?: string;
		/** What it is, where it is not a branch: an Iconify class (a project's, say), or a picture (its repository's). */
		icon?: string | Snippet;
		current?: boolean;
		leaving?: boolean;
		dragging?: boolean;
		highlighted?: boolean;
		unread?: boolean;
		/** Whether an agent waits for the person's answer; a path where it isn't this row's own (one folded under it). */
		asking?: boolean | string;
		waiting?: boolean;
		working?: boolean;
		/** Whether a person locked it against archiving (FDR-015): shown in the status slot while it has no other status. */
		locked?: boolean;
		/** Whether a person marked it inactive (put it aside for later): its title is quieter. */
		inactive?: boolean;
		progress?: ActivityId;
		standing?: WorkspaceStanding | null;
		actions?: WorkspaceAction[];
		fold?: { count: number; folded: boolean; toggle(): void };
		onaction?: (action: WorkspaceAction) => void;
		/** Whether what is under it folds from beside it (the outline's fold, FDR-019), not from its sign. */
		foldAside?: boolean;
		/** Whether a long title wraps (a Plan window); else it is cut short (the sidebar). */
		wrap?: boolean;
	} = $props();

	// Only promote the main action. Routine publishing stays inside the workspace.
	const pillColors: Partial<Record<WorkspaceAction['id'], string>> = $derived({
		'merge-pull': standing?.tone === 'ok' ? 'tone-ok' : 'bg-sunken text-muted',
		'resolve-conflicts': 'tone-danger',
		'fix-checks': 'tone-danger',
		'address-review': 'tone-danger',
		archive: 'tone-merged'
	});

	const primary = $derived(actions.find((action) => !action.aside));
	const pillColor = $derived(standing && primary && onaction && pillColors[primary.id]);
	const visibleStanding = $derived(standing?.tone === 'accent' ? null : standing);

	let submitting = $state<WorkspaceAction['id']>();
	const activity = $derived(
		working && !asking && !waiting ? 'working' : leaving ? 'archive' : (progress ?? submitting)
	);

	async function activate(action: WorkspaceAction) {
		submitting = action.id;
		try {
			await onaction?.(action);
		} finally {
			submitting = undefined;
		}
	}
</script>

<!-- the whole row is the item: the link, and what appears beside it on hover. Where a long
     title wraps (`wrap`), what is beside it stays level with its first line -->
<div
	class={[
		'group relative item pr-1 text-base',
		// on its way out: it shows, and there is nothing more to do with it
		dragging && 'opacity-60',
		leaving && 'pointer-events-none',
		current && 'item-active',
		// it came to rest out of sight, and they haven't looked since
		unread && 'font-semibold text-ink',
		highlighted && 'bg-hover text-ink',
		// put aside for later: quieter, until it is looked at
		inactive && !current && !unread && !highlighted && 'text-faint'
	]}
>
	<!-- one with its own folded under it shows the link as its icon, which turns into the fold on hover -->
	{#if parentHref && !fold}
		{@const label = parentTitle ? `Open parent workspace: ${parentTitle}` : 'Open parent workspace'}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- caller passes a resolved URL -->
		<a
			href={parentHref}
			class="mt-1.5 ml-1.5 grid size-5 shrink-0 place-items-center self-start rounded-control text-faint hover:text-ink focus-visible:text-ink"
			aria-label={label}
			title={label}
			draggable="false"
		>
			<span class="icon-[lucide--link] size-4"></span>
		</a>
	{/if}
	<div class="relative flex min-w-0 flex-1">
		<RowLabel
			{title}
			{href}
			{current}
			icon={parentHref && !fold && !waiting ? undefined : statusIcon}
			hint={parentTitle ? `Reports to "${parentTitle}"` : undefined}
			fold={leaving ? undefined : fold}
			chevron={!foldAside}
			{wrap}
			class={parentHref && !fold && !waiting ? 'py-1 pl-0' : 'py-1'}
		/>
	</div>
	<!-- A standing gives way to its action on hover or keyboard focus. -->
	<span data-row-actions class="mt-1 grid h-6 min-w-6 shrink-0 place-items-center self-start">
		{#if typeof asking === 'string' || (asking && href)}
			<QuestionLink workspaceHref={typeof asking === 'string' ? asking : href!} />
		{:else if asking}
			<StatusIcon tone="accent" label="Waiting for your answer">
				<span class="icon-[lucide--message-circle-question] size-4"></span>
			</StatusIcon>
		{:else if activity}
			<WorkspaceActivity {activity} />
		{:else if primary && pillColor}
			<button
				type="button"
				class={['indicator-action hover:bg-current/20', pillColor]}
				aria-label="{primary.label} — {title}"
				title={visibleStanding?.label ?? primary.label}
				onclick={() => activate(primary)}
			>
				<span class={[primary.icon, 'size-4 shrink-0']}></span>
				{primary.label}
			</button>
		{:else if visibleStanding?.activity}
			<WorkspaceActivity activity={visibleStanding.activity} />
		{:else if visibleStanding}
			<StandingIcon standing={visibleStanding} />
		{:else if locked && !waiting}
			<StatusIcon label="Locked: can't be archived">
				<span class="icon-[heroicons--lock-closed-solid] size-4"></span>
			</StatusIcon>
		{/if}
	</span>
</div>
{#snippet statusIcon()}
	{#if waiting}
		<span class="icon-[lucide--clock] size-4" role="img" aria-label="Waiting for daemon"></span>
	{:else if typeof icon === 'function'}
		{@render icon()}
	{:else if icon}
		<span class={[icon, 'size-4 text-faint']}></span>
	{:else if parentHref && fold}
		<span class="icon-[lucide--link] size-4 text-faint"></span>
	{:else}
		<span class="icon-[lucide--git-branch] size-4 text-faint"></span>
	{/if}
{/snippet}
