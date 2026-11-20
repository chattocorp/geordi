<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { WorkspaceAction, WorkspaceStanding } from './actions.ts';
	import SidebarRowLabel from './SidebarRowLabel.svelte';
	import Spinner from './Spinner.svelte';
	import StandingIcon from './StandingIcon.svelte';

	let {
		title,
		href,
		parentTitle,
		child = false,
		icon,
		current = false,
		leaving = false,
		dragging = false,
		highlighted = false,
		unread = false,
		asking = false,
		waiting = false,
		working = false,
		progress,
		standing = null,
		actions = [],
		fold,
		onpoint,
		onaction,
		onarchive
	}: {
		title: string;
		href?: string;
		parentTitle?: string;
		child?: boolean;
		/** What it is, where it is not a branch: an Iconify class (a project's, say). */
		icon?: string;
		current?: boolean;
		leaving?: boolean;
		dragging?: boolean;
		highlighted?: boolean;
		unread?: boolean;
		asking?: boolean;
		waiting?: boolean;
		working?: boolean;
		progress?: string;
		standing?: WorkspaceStanding | null;
		actions?: WorkspaceAction[];
		fold?: { count: number; folded: boolean; toggle(): void };
		onpoint?: (pointed: boolean) => void;
		onaction?: (action: WorkspaceAction) => void;
		onarchive?: () => void;
	} = $props();

	// Only promote the main action. Routine publishing stays inside the workspace.
	const danger = 'bg-danger-soft text-danger hover:bg-danger/20';
	const pillColors: Partial<Record<WorkspaceAction['id'], string>> = {
		'merge-pull': 'bg-ok/12 text-ok hover:bg-ok/20',
		'resolve-conflicts': danger,
		'fix-checks': danger,
		'address-review': danger,
		archive: 'bg-merged/15 text-merged hover:bg-merged/25'
	};

	// Keep the clicked Archive pill visible even after the row starts leaving.
	let archiveReceipt = $state<WorkspaceAction>();
	let reset: ReturnType<typeof setTimeout>;
	onDestroy(() => clearTimeout(reset));

	const primary = $derived(archiveReceipt ?? actions.find((action) => !action.aside));
	const pillColor = $derived(primary && (archiveReceipt || onaction) && pillColors[primary.id]);
	const visibleStanding = $derived(leaving || standing?.tone === 'accent' ? null : standing);

	let submitting = $state<string>();
	const activity = $derived(progress ?? submitting);

	async function activate(action: WorkspaceAction) {
		if (action.id === 'archive') {
			archiveReceipt = action;
			clearTimeout(reset);
			reset = setTimeout(() => (archiveReceipt = undefined), 1500);
			await onaction?.(action);
			return;
		}
		submitting = action.label + ' in progress';
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
		(leaving || dragging) && 'opacity-60',
		leaving && 'pointer-events-none',
		current && 'item-active',
		// it came to rest out of sight, and they haven't looked since
		unread && 'font-semibold text-ink',
		highlighted && 'bg-surface/60 text-ink'
	]}
>
	<SidebarRowLabel
		{title}
		{href}
		{current}
		{onpoint}
		icon={statusIcon}
		hint={parentTitle ? `Started by the agent in "${parentTitle}"` : undefined}
		fold={leaving ? undefined : fold}
		class="py-1"
	/>
	<!-- A standing gives way to its action on hover or keyboard focus. -->
	<span class="grid h-6 min-w-6 shrink-0 place-items-center">
		{#if activity && !leaving}
			<span class="col-start-1 row-start-1 grid w-6 place-items-center text-muted">
				<Spinner label={activity} />
			</span>
		{:else if visibleStanding}
			<span
				class={[
					'col-start-1 row-start-1 grid w-6 place-items-center justify-self-end',
					archiveReceipt
						? 'opacity-0'
						: pillColor
							? 'motion-safe:transition-opacity motion-safe:duration-150 reveal:pointer-events-none reveal:opacity-0'
							: onarchive && 'reveal:invisible'
				]}
			>
				<StandingIcon standing={visibleStanding} />
			</span>
		{/if}
		{#if !activity && primary && pillColor}
			<button
				type="button"
				class={[
					'col-start-1 row-start-1 inline-flex h-6 items-center gap-1 overflow-hidden rounded-full text-xs font-medium whitespace-nowrap motion-safe:transition-all motion-safe:duration-150 motion-safe:ease-out',
					archiveReceipt
						? 'w-max px-2'
						: 'pointer-events-none w-0 opacity-0 reveal:pointer-events-auto reveal:w-max reveal:px-2 reveal:opacity-100',
					pillColor
				]}
				style:interpolate-size="allow-keywords"
				aria-label="{primary.label} — {title}"
				onclick={() => activate(primary)}
			>
				{primary.label}
				<span class={[archiveReceipt ? 'icon-[lucide--check]' : primary.icon, 'size-3.5']}></span>
			</button>
		{:else if !activity && onarchive}
			<button
				type="button"
				class={[
					'invisible col-start-1 row-start-1 grid size-6 place-items-center rounded-control hover:bg-hover reveal:visible',
					standing?.tone === 'merged' ? 'text-merged' : 'text-muted hover:text-ink'
				]}
				title="Archive workspace"
				aria-label="Archive {title}"
				onclick={onarchive}
			>
				<span class="icon-[lucide--archive] size-3.5"></span>
			</button>
		{/if}
	</span>
</div>
{#snippet statusIcon()}
	{#if leaving}
		<Spinner label="Archiving" />
	{:else if asking}
		<!-- an agent there waits for the person's answer -->
		<span
			class="icon-[lucide--message-circle-question] size-4 text-accent-ink"
			role="img"
			aria-label="Waiting for your answer"
		></span>
	{:else if waiting}
		<span class="icon-[lucide--clock] size-4" role="img" aria-label="Waiting for daemon"></span>
	{:else if working}
		<!-- its agent, one working alongside it, or one folded away under it -->
		<Spinner />
	{:else if icon}
		<span class={[icon, 'size-4']}></span>
	{:else if child}
		<!-- started by an agent: the one above it, where that is still around -->
		<span class="icon-[lucide--corner-down-right] size-4"></span>
	{:else}
		<span class="icon-[lucide--git-branch] size-4"></span>
	{/if}
{/snippet}
