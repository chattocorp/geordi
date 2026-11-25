<script lang="ts">
	import type { Snippet } from 'svelte';
	import WorkspaceActivity from './WorkspaceActivity.svelte';
	import type { ActivityId, WorkspaceAction, WorkspaceStanding } from './actions.ts';
	import ValueBadge from './ValueBadge.svelte';
	import RowLabel from './RowLabel.svelte';

	import QuestionLink from './QuestionLink.svelte';
	import StandingIcon from './StandingIcon.svelte';
	import Spinner from './Spinner.svelte';
	import StatusIcon from './StatusIcon.svelte';

	let {
		title,
		href,
		parentTitle,
		repositoryName,
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
		versions = [],
		actions = [],
		fold,
		onpoint,
		onaction
	}: {
		title: string;
		href?: string;
		parentTitle?: string;
		repositoryName?: string;
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
		versions?: { path: string; name: string | null; version: string }[];
		actions?: WorkspaceAction[];
		fold?: { count: number; folded: boolean; toggle(): void };
		onpoint?: (pointed: boolean) => void;
		onaction?: (action: WorkspaceAction) => void;
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
	<div class="relative flex min-w-0 flex-1">
		<RowLabel
			{title}
			{href}
			{current}
			{onpoint}
			icon={statusIcon}
			hint={[repositoryName, parentTitle && `Started by the agent in "${parentTitle}"`]
				.filter(Boolean)
				.join(' · ') || undefined}
			fold={leaving ? undefined : fold}
			class="py-1"
		/>
	</div>
	<!-- A standing gives way to its action on hover or keyboard focus. -->
	<span data-row-actions class="flex min-h-6 max-w-2/3 min-w-6 items-center justify-end">
		{#if versions.length}
			<span class="mr-1 flex min-w-0 flex-wrap justify-end gap-1">
				{#each versions as pkg (pkg.path)}
					<ValueBadge
						label={pkg.name}
						value={pkg.version}
						href={href ? `${href}?changeset` : undefined}
						linkLabel={`Open Changeset for ${title}: ${pkg.name ? pkg.name + ' ' : ''}${pkg.version}`}
					/>
				{/each}
			</span>
		{/if}
		{#if typeof asking === 'string' || (asking && href)}
			<QuestionLink workspaceHref={typeof asking === 'string' ? asking : href!} />
		{:else if asking}
			<StatusIcon tone="accent" label="Waiting for your answer">
				<span class="icon-[lucide--message-circle-question] size-4"></span>
			</StatusIcon>
		{:else if waiting && repositoryName}
			<StatusIcon label="Waiting for daemon">
				<span class="icon-[lucide--clock] size-4"></span>
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
	{#if waiting && !repositoryName}
		<span class="icon-[lucide--clock] size-4" role="img" aria-label="Waiting for daemon"></span>
	{:else if typeof icon === 'function'}
		{@render icon()}
	{:else if icon}
		<span class={[icon, 'size-4 text-faint']}></span>
	{:else}
		<span class="icon-[lucide--git-branch] size-4 text-faint"></span>
	{/if}
{/snippet}
