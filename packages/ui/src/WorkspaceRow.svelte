<script lang="ts">
	import type { Snippet } from 'svelte';
	import WorkspaceActivity from './WorkspaceActivity.svelte';
	import type { ActivityId, WorkspaceAction, WorkspaceStanding } from './actions.ts';
	import RowLabel from './RowLabel.svelte';

	import QuestionLink from './QuestionLink.svelte';
	import StandingIcon from './StandingIcon.svelte';
	import Spinner from './Spinner.svelte';
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
		background = 0,
		progress,
		standing = null,
		actions = [],
		fold,
		onpoint,
		onaction
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
		/** How many tasks its agents left running in the background. */
		background?: number;
		progress?: ActivityId;
		standing?: WorkspaceStanding | null;
		actions?: WorkspaceAction[];
		fold?: { count: number; folded: boolean; toggle(): void };
		onpoint?: (pointed: boolean) => void;
		onaction?: (action: WorkspaceAction) => void;
	} = $props();

	// Only promote the main action. Routine publishing stays inside the workspace.
	const pillColors: Partial<Record<WorkspaceAction['id'], string>> = {
		'merge-pull': 'tone-ok',
		'resolve-conflicts': 'tone-danger',
		'fix-checks': 'tone-danger',
		'address-review': 'tone-danger',
		archive: 'tone-merged'
	};

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

<!-- the whole row is the item: the link, and what appears beside it on hover -->
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
			class="ml-1.5 grid size-5 shrink-0 place-items-center rounded-control text-faint hover:text-ink focus-visible:text-ink"
			aria-label={label}
			title={label}
			draggable="false"
			onpointerenter={() => onpoint?.(true)}
			onpointerleave={() => onpoint?.(false)}
			onfocus={() => onpoint?.(true)}
			onblur={() => onpoint?.(false)}
		>
			<span class="icon-[lucide--link] size-4"></span>
		</a>
	{/if}
	<div class="relative flex min-w-0 flex-1">
		<RowLabel
			{title}
			{href}
			{current}
			{onpoint}
			icon={parentHref && !fold && !waiting ? undefined : statusIcon}
			hint={parentTitle ? `Started by the agent in "${parentTitle}"` : undefined}
			fold={leaving ? undefined : fold}
			class={parentHref && !fold && !waiting ? 'py-1 pl-0' : 'py-1'}
		/>
	</div>
	<!-- A standing gives way to its action on hover or keyboard focus. -->
	<span class="grid h-6 min-w-6 shrink-0 place-items-center">
		{#if typeof asking === 'string' || (asking && href)}
			<QuestionLink workspaceHref={typeof asking === 'string' ? asking : href!} />
		{:else if asking}
			<StatusIcon tone="accent" label="Waiting for your answer">
				<span class="icon-[lucide--message-circle-question] size-4"></span>
			</StatusIcon>
		{:else if activity}
			<WorkspaceActivity {activity} />
		{:else if background}
			<StatusIcon label="{background} running in the background">
				<span aria-hidden="true" class="inline-flex"><Spinner still /></span>
			</StatusIcon>
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
