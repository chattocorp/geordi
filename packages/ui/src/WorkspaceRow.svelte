<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { WorkspaceAction, WorkspaceStanding } from './actions.ts';
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
		standing?: WorkspaceStanding | null;
		actions?: WorkspaceAction[];
		fold?: { count: number; folded: boolean; toggle(): void };
		onpoint?: (pointed: boolean) => void;
		onaction?: (action: WorkspaceAction) => void;
		onarchive?: () => void;
	} = $props();

	const bodyClass = 'flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1';
	// Only promote the main action. Routine publishing stays inside the workspace.
	const pillColors: Partial<Record<WorkspaceAction['id'], string>> = {
		'merge-pull': 'bg-ok/12 text-ok hover:bg-ok/20',
		'resolve-conflicts': 'bg-danger-soft text-danger hover:bg-danger/20',
		'fix-checks': 'bg-danger-soft text-danger hover:bg-danger/20',
		'address-review': 'bg-danger-soft text-danger hover:bg-danger/20',
		archive: 'bg-merged/15 text-merged hover:bg-merged/25'
	};

	const primary = $derived(actions.find((action) => !action.aside));
	const pillColor = $derived(primary && onaction && pillColors[primary.id]);
	const visibleStanding = $derived(leaving || standing?.tone === 'accent' ? null : standing);

	let activated = $state<WorkspaceAction['id']>();
	let reset: ReturnType<typeof setTimeout>;
	onDestroy(() => clearTimeout(reset));

	function activate(action: WorkspaceAction) {
		activated = action.id;
		clearTimeout(reset);
		reset = setTimeout(() => (activated = undefined), 1500);
		onaction?.(action);
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
	{#if href}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the forge passes a resolved workspace URL -->
		<a
			{href}
			class={bodyClass}
			draggable="false"
			aria-current={current ? 'page' : undefined}
			title={parentTitle ? `Started by the agent in "${parentTitle}"` : undefined}
			onpointerenter={() => onpoint?.(true)}
			onpointerleave={() => onpoint?.(false)}
			onfocus={() => onpoint?.(true)}
			onblur={() => onpoint?.(false)}
		>
			{@render body()}
		</a>
	{:else}
		<span class={bodyClass} aria-current={current ? true : undefined}>{@render body()}</span>
	{/if}
	<!-- with workspaces under it: pointed at, its icon becomes the way to fold them -->
	{#if fold && !leaving}
		<button
			type="button"
			class="invisible absolute top-1/2 left-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-control text-muted group-hover:visible group-has-focus-visible:visible hover:text-ink"
			aria-expanded={!fold.folded}
			aria-label="{fold.folded ? 'Unfold' : 'Fold'} {title}"
			title={fold.folded ? `Show the ${fold.count} under it` : `Fold the ${fold.count} under it`}
			onclick={fold.toggle}
		>
			<span
				class={[
					'size-4',
					fold.folded ? 'icon-[lucide--chevron-right]' : 'icon-[lucide--chevron-down]'
				]}
			></span>
		</button>
	{/if}
	<!-- A standing gives way to its action on hover or keyboard focus. -->
	<span class="grid h-6 min-w-6 shrink-0 place-items-center">
		{#if visibleStanding}
			<span
				class={[
					'col-start-1 row-start-1 grid w-6 place-items-center justify-self-end',
					(pillColor || onarchive) &&
						(pillColor
							? 'group-hover:pointer-events-none group-hover:opacity-0 group-has-focus-visible:pointer-events-none group-has-focus-visible:opacity-0 motion-safe:transition-opacity motion-safe:duration-150'
							: 'group-hover:invisible group-has-focus-visible:invisible')
				]}
			>
				<StandingIcon standing={visibleStanding} />
			</span>
		{/if}
		{#if onaction && primary && pillColor}
			<button
				type="button"
				class={[
					'pointer-events-none col-start-1 row-start-1 inline-flex h-6 w-0 items-center gap-1 overflow-hidden rounded-full text-xs font-medium whitespace-nowrap opacity-0 motion-safe:transition-all motion-safe:duration-150 motion-safe:ease-out',
					'group-hover:pointer-events-auto group-hover:w-max group-hover:px-2 group-hover:opacity-100 group-has-focus-visible:pointer-events-auto group-has-focus-visible:w-max group-has-focus-visible:px-2 group-has-focus-visible:opacity-100',
					pillColor
				]}
				style:interpolate-size="allow-keywords"
				aria-label="{primary.label} — {title}"
				onclick={() => activate(primary)}
			>
				{primary.label}
				<span class={[activated === primary.id ? 'icon-[lucide--check]' : primary.icon, 'size-3.5']}
				></span>
			</button>
		{:else if onarchive}
			<button
				type="button"
				class={[
					'invisible col-start-1 row-start-1 grid size-6 place-items-center rounded-control group-hover:visible group-has-focus-visible:visible hover:bg-hover',
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
{#snippet body()}
	<!-- what it is, or is doing, in one place: every title starts on the same edge -->
	<!-- as wide as the repository's picture above, and right under it -->
	<span
		class={[
			'grid size-5 shrink-0 place-items-center text-muted/80',
			fold && !leaving && 'group-hover:invisible group-has-focus-visible:invisible'
		]}
	>
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
	</span>
	<span class="min-w-0 truncate">{title}</span>
	{#if fold?.folded}
		<span class="shrink-0 font-normal text-muted/60 tabular-nums">{fold.count}</span>
	{/if}
{/snippet}
