<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceAction, WorkspaceStanding } from '#lib/actions.ts';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { settingsPath } from '#lib/components/settings.svelte.ts';
	import StandingIcon from '#lib/components/StandingIcon.svelte';
	import {
		actFromAfar,
		archiveAndNavigate,
		continueFromAfar
	} from '#lib/components/workspace/afar.svelte.ts';
	import { beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import { pendingPullAction } from '#lib/components/workspace/review.svelte.ts';
	import { byRepository, inFocus, unfolded } from '#lib/family.ts';
	import { hint } from '#lib/keys.ts';
	import { unread } from '#lib/notifications.svelte.ts';
	import { lanes } from '#lib/overview.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
	import Spinner from '#lib/ui/Spinner.svelte';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { moveWorkspace, stopAgent } from '../../routes/workspaces.remote';

	/**
	 * The sidebar's sheet: where to go (the overview, a new workspace), the workspaces by
	 * repository, and the settings below. `nav` is what there is, once known; `path` is the
	 * page on screen, which is marked. `folded` is what is folded away: the workspaces of a
	 * repository under its name, and those its agents started under a workspace. `focus` is
	 * the repository shown alone, if any.
	 */
	let {
		nav,
		path,
		folded,
		focus,
		lost = false
	}: {
		nav: Navigation | undefined;
		path: string;
		folded: { current: string[] };
		focus: { current: string | null };
		lost?: boolean;
	} = $props();

	type Item = Navigation['workspaces'][number];

	/** The workspaces by repository, each agent-started one after the one that started it. */
	const listed = $derived(byRepository(nav?.workspaces ?? []));
	const withWorkspaces = $derived(nav?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
	const sidebarRepos = $derived(inFocus(withWorkspaces, focus.current));
	/** How many repositories a focus hides: offered at the end, to show them again. */
	const hidden = $derived(withWorkspaces.length - sidebarRepos.length);

	/**
	 * Repositories slide away and back when the focus changes, and only then: not when the
	 * list first arrives, nor when a repository comes or goes on its own.
	 */
	let shifting = $state(false);
	let lastFocus = focus.current;
	$effect.pre(() => {
		if (focus.current === lastFocus) return;
		lastFocus = focus.current;
		shifting = !prefersReducedMotion.current;
		const settled = setTimeout(() => (shifting = false), MOTION + 50);
		return () => clearTimeout(settled);
	});
	const motion = () => ({ duration: shifting ? MOTION : 0, easing: cubicOut });
	/** How many workspaces wait for the person: counted beside the overview. */
	const needYou = $derived(lanes(nav?.workspaces ?? [], unread).attention.length);
	/** A workspace counts as working, for archiving, while anything its agent started is. */
	const working = (workspace: Item): boolean =>
		workspace.working ||
		(nav?.workspaces ?? []).some((other) => other.parentId === workspace.id && working(other));
	/** The parent of the workspace the pointer is on: lit up, to show who it belongs to. */
	let pointedAt = $state<string | null>(null);

	/** The colour of what to do next, from how the workspace stands: as in its ribbon. */
	const actionTone = (standing: WorkspaceStanding | null): MenuTone =>
		standing?.tone === 'ok' || standing?.tone === 'merged' ? standing.tone : 'accent';

	// Only promote the main action. Routine publishing stays inside the workspace.
	const pillColors: Partial<Record<WorkspaceAction['id'], string>> = {
		'merge-pull': 'bg-ok/12 text-ok hover:bg-ok/20',
		'resolve-conflicts': 'bg-danger-soft text-danger hover:bg-danger/20',
		'fix-checks': 'bg-danger-soft text-danger hover:bg-danger/20',
		'address-review': 'bg-danger-soft text-danger hover:bg-danger/20',
		archive: 'bg-merged/15 text-merged hover:bg-merged/25'
	};

	/** What can be done with a workspace from the sidebar, without opening it. */
	function workspaceMenu(workspace: Item): MenuItem[] {
		const href = resolve('/workspaces/[id]', { id: workspace.id });
		const running = workspace.status === 'running';
		// archiving takes the workspaces its agent started along: none of them may be working
		const busy = working(workspace);
		// the menu has these already, below
		const next = workspace.actions.filter(({ id }) => id !== 'continue' && id !== 'archive');
		return [
			...next.map((action) => ({
				label: action.label,
				icon: action.icon,
				tone: actionTone(workspace.standing),
				disabled: !!action.pullNumber && pendingPullAction.has(workspace.id),
				onselect: () => actFromAfar(workspace, action)
			})),
			...(next.length > 0 ? ['separator' as const] : []),
			{
				label: 'Open in new tab',
				icon: 'icon-[lucide--external-link]',
				onselect: () => window.open(href, '_blank', 'noopener')
			},
			{
				label: 'Copy ID',
				icon: 'icon-[lucide--hash]',
				onselect: () => navigator.clipboard.writeText(workspace.id)
			},
			{
				label: 'Copy branch name',
				icon: 'icon-[lucide--git-branch]',
				disabled: !workspace.branch,
				onselect: () => navigator.clipboard.writeText(workspace.branch ?? '')
			},
			'separator',
			{
				label: 'Continue on a new branch',
				icon: 'icon-[lucide--git-branch-plus]',
				disabled: busy,
				onselect: () => continueFromAfar(workspace)
			},
			{
				label: 'Stop agent',
				icon: 'icon-[lucide--square]',
				disabled: !running,
				onselect: () => stopAgent(workspace.id)
			},
			{
				label: 'Archive',
				icon: 'icon-[lucide--archive]',
				tone: 'merged',
				disabled: beingArchived.has(workspace.id),
				onselect: () => archiveAndNavigate(workspace)
			}
		];
	}

	type Row = { workspace: Item; parent: Item | null; depth: number };

	/**
	 * The workspace being dragged to another place in its repository's list, and where it
	 * would go: above that workspace, `null` for the end, `undefined` for nowhere new. Only
	 * workspaces that stand at the top move; the ones their agents started go along.
	 */
	let dragged = $state<Item | null>(null);
	let dropBefore = $state<string | null | undefined>(undefined);

	/** Over a row: above it, if that stands at the top and the pointer is on its upper half; else above the next that does. */
	function overRow(event: DragEvent & { currentTarget: HTMLElement }, rows: Row[], index: number) {
		if (!dragged || dragged.repoId !== rows[index].workspace.repoId) {
			dropBefore = undefined;
			return;
		}
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		const rect = event.currentTarget.getBoundingClientRect();
		const upper = event.clientY < rect.top + rect.height / 2;
		const next = rows.findIndex(
			(row, at) => row.depth === 0 && (at > index || (upper && at === index))
		);
		const before = next === -1 ? null : rows[next].workspace.id;
		// where it is already: above itself, or above the one after it
		const at = rows.findIndex((row) => row.workspace.id === dragged!.id);
		const after = rows.findIndex((row, i) => i > at && row.depth === 0);
		const stays =
			before === dragged.id || before === (after === -1 ? null : rows[after].workspace.id);
		dropBefore = stays ? undefined : before;
	}

	function drop(event: DragEvent, repoId: string) {
		event.preventDefault();
		if (dragged?.repoId === repoId && dropBefore !== undefined)
			void moveWorkspace({ workspaceId: dragged.id, before: dropBefore });
		endDrag();
	}

	function endDrag() {
		dragged = null;
		dropBefore = undefined;
	}

	const toggleFolded = (id: string) =>
		(folded.current = folded.current.includes(id)
			? folded.current.filter((other) => other !== id)
			: [...folded.current, id]);
	const settingsHint = hint('settings');
	const focusHint = hint('focusRepo');
	/** How long repositories take to slide away or back, in milliseconds. */
	const MOTION = 200;
	const inSettings = $derived(path.startsWith('/settings'));
</script>

<div class="flex min-h-0 flex-1 flex-col sheet-quiet select-none">
	<nav class="flex-1 space-y-6 overflow-y-auto p-2" aria-label="Main">
		<div class="space-y-0.5">
			{@render link(
				resolve('/overview'),
				'icon-[lucide--layout-list]',
				'Overview',
				path === '/overview',
				needYou
			)}
			{@render link(resolve('/archive'), 'icon-[lucide--archive]', 'Archive', path === '/archive')}
			{@render link(resolve('/'), 'icon-[lucide--plus]', 'New workspace', path === '/')}
		</div>

		<!--
			Each repository keeps its own space below it, rather than space between them: what
			slides away takes its space along, and nothing is left to jump when it is gone.
		-->
		<div>
			{#each sidebarRepos as repo (repo.id)}
				{@const all = listed.get(repo.id) ?? []}
				{@const rows = unfolded(all, folded.current)}
				{@const isFolded = folded.current.includes(repo.id)}
				{@const focused = focus.current === repo.id}
				<div class="pb-4" transition:slide={motion()}>
					<!--
				A label for what is under it: its picture, its name (quiet, by its colour: the
				workspaces are what is read here), and the way to start something in it. What is
				under it lines up with it: icon under picture, title under name.
			-->
					<div class="group flex h-7 items-center pr-1.5">
						<button
							type="button"
							class="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 pl-1.5 text-left text-sm font-semibold text-muted hover:text-ink"
							aria-expanded={!isFolded}
							onclick={() => toggleFolded(repo.id)}
						>
							<RepoIcon id={repo.id} />
							<span class="truncate">{repo.name}</span>
							{#if isFolded}
								<span class="shrink-0 font-normal text-muted/60 tabular-nums">{all.length}</span>
							{/if}
						</button>
						<button
							type="button"
							class={[
								'invisible grid size-6 shrink-0 place-items-center rounded-control group-hover:visible group-has-focus-visible:visible hover:bg-sunken hover:text-ink',
								focused ? 'bg-sunken text-ink' : 'text-muted'
							]}
							title={focused
								? `Show all repositories (${focusHint})`
								: `Show only ${repo.name} (${focusHint})`}
							aria-label={focused ? 'Show all repositories' : `Show only ${repo.name}`}
							aria-pressed={focused}
							onclick={() => (focus.current = focused ? null : repo.id)}
						>
							<span class="icon-[lucide--search] size-4"></span>
						</button>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus which repository -->
						<a
							href="{resolve('/')}?repo={repo.id}"
							class="invisible grid size-6 shrink-0 place-items-center rounded-control text-muted group-hover:visible group-has-focus-visible:visible hover:bg-hover hover:text-ink"
							title="New workspace in {repo.name}"
							aria-label="New workspace in {repo.name}"
						>
							<span class="icon-[lucide--plus] size-4"></span>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
					{#if !isFolded}
						<ul
							class="space-y-px"
							ondragleave={(event) => {
								if (!event.currentTarget.contains(event.relatedTarget as Node | null))
									dropBefore = undefined;
							}}
						>
							{#each rows as { workspace, parent, depth, under }, index (workspace.id)}
								{@render row(workspace, parent, depth, under, rows, index)}
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
			<!-- with one repository shown alone, the others wait here, out of the way -->
			{#if hidden > 0}
				<button
					type="button"
					class="mb-4 flex h-7 w-full items-center gap-2 pr-2 pl-1.5 text-left text-sm text-muted/60 hover:text-ink"
					transition:slide={motion()}
					onclick={() => (focus.current = null)}
				>
					<span class="grid size-5 shrink-0 place-items-center">
						<span class="icon-[lucide--chevrons-up-down] size-4"></span>
					</span>
					<span class="truncate">
						Show {hidden} other {hidden === 1 ? 'repository' : 'repositories'}
					</span>
				</button>
			{/if}
		</div>
	</nav>

	<div class="p-2">
		<ConnectionIndicator {lost} class="px-2.5 py-1" />
		<a
			href={settingsPath()}
			class={['item gap-2.5 px-2.5 py-1.5 text-base', inSettings && 'item-active font-medium']}
			aria-current={inSettings ? 'page' : undefined}
		>
			<span class="icon-[lucide--settings] size-4 shrink-0"></span>
			Settings
			<kbd class="ml-auto font-sans text-xs text-muted">{settingsHint}</kbd>
		</a>
	</div>
</div>

{#snippet row(
	workspace: Item,
	parent: Item | null,
	depth: number,
	under: number,
	rows: Row[],
	index: number
)}
	{@const isFolded = under > 0 && folded.current.includes(workspace.id)}
	{@const current = path === `/workspaces/${workspace.id}`}
	{@const busy = working(workspace)}
	{@const leaving = beingArchived.has(workspace.id)}
	<!-- Routine publishing steps only need to appear inside the workspace. -->
	{@const standing = leaving || workspace.standing?.tone === 'accent' ? null : workspace.standing}
	{@const archivable = !busy && !leaving}
	{@const primary = workspace.actions.find((action) => !action.aside)}
	{@const pillColor = primary && pillColors[primary.id]}
	<!-- one started by an agent sits a little in from the one that started it -->
	<!-- where a workspace being dragged would go: a line above this one, or below the last -->
	<li
		style:margin-inline-start="calc(var(--spacing) * {3 * depth})"
		class={[
			dropBefore === workspace.id && 'row-drop-before',
			dragged?.repoId === workspace.repoId &&
				dropBefore === null &&
				index === rows.length - 1 &&
				'row-drop-after'
		]}
		draggable={depth === 0 && !leaving}
		ondragstart={(event) => {
			dragged = workspace;
			event.dataTransfer?.setData('text/plain', workspace.title);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		}}
		ondragend={endDrag}
		ondragover={(event) => overRow(event, rows, index)}
		ondrop={(event) => drop(event, workspace.repoId)}
	>
		<!-- the whole row is the item: the link, and what appears beside it on hover -->
		<div
			class={[
				'group relative item pr-1 text-base',
				// on its way out: it shows, and there is nothing more to do with it
				(leaving || dragged?.id === workspace.id) && 'opacity-60',
				leaving && 'pointer-events-none',
				current && 'item-active',
				// it came to rest out of sight, and they haven't looked since
				unread.has(workspace.id) && 'font-semibold text-ink',
				pointedAt === workspace.id && 'bg-surface/60 text-ink'
			]}
			{@attach contextMenu(() => workspaceMenu(workspace))}
		>
			<a
				href={resolve('/workspaces/[id]', { id: workspace.id })}
				class="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1.5 pl-1.5"
				draggable="false"
				aria-current={current ? 'page' : undefined}
				title={parent ? `Started by the agent in "${parent.title}"` : undefined}
				onpointerenter={() => (pointedAt = parent?.id ?? null)}
				onpointerleave={() => (pointedAt = null)}
				onfocus={() => (pointedAt = parent?.id ?? null)}
				onblur={() => (pointedAt = null)}
			>
				<!-- what it is, or is doing, in one place: every title starts on the same edge -->
				<!-- as wide as the repository's picture above, and right under it -->
				<span
					class={[
						'grid size-5 shrink-0 place-items-center text-muted/80',
						under > 0 && !leaving && 'group-hover:invisible group-has-focus-visible:invisible'
					]}
				>
					{#if leaving}
						<Spinner label="Archiving" />
					{:else if workspace.outcome === 'asking'}
						<!-- an agent there waits for the person's answer -->
						<span class="icon-[lucide--message-circle-question] size-4 text-accent-ink"></span>
					{:else if workspace.waiting}
						<span class="icon-[lucide--clock] size-4" role="img" aria-label="Waiting for daemon"
						></span>
					{:else if workspace.working || (isFolded && busy)}
						<!-- its agent, one working alongside it, or one folded away under it -->
						<Spinner />
					{:else if workspace.parentId}
						<!-- started by an agent: the one above it, where that is still around -->
						<span class="icon-[lucide--corner-down-right] size-4"></span>
					{:else}
						<span class="icon-[lucide--git-branch] size-4"></span>
					{/if}
				</span>
				<span class="min-w-0 truncate">{workspace.title}</span>
				{#if isFolded}
					<span class="shrink-0 font-normal text-muted/60 tabular-nums">{under}</span>
				{/if}
			</a>
			<!-- with workspaces under it: pointed at, its icon becomes the way to fold them -->
			{#if under > 0 && !leaving}
				<button
					type="button"
					class="invisible absolute top-1/2 left-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-control text-muted group-hover:visible group-has-focus-visible:visible hover:text-ink"
					aria-expanded={!isFolded}
					aria-label="{isFolded ? 'Unfold' : 'Fold'} {workspace.title}"
					title={isFolded ? `Show the ${under} under it` : `Fold the ${under} under it`}
					onclick={() => toggleFolded(workspace.id)}
				>
					<span
						class={[
							'size-4',
							isFolded ? 'icon-[lucide--chevron-right]' : 'icon-[lucide--chevron-down]'
						]}
					></span>
				</button>
			{/if}
			<!--
				At its end: how its work stands, at a glance. Pointed at, that makes way for what
				can be done with it. The title yields space only while a pill is visible.
			-->
			<span class="grid h-6 min-w-6 shrink-0 place-items-center">
				{#if standing}
					<span
						class={[
							'col-start-1 row-start-1 grid w-6 place-items-center justify-self-end',
							archivable &&
								(pillColor
									? 'group-hover:opacity-0 group-has-focus-visible:opacity-0 motion-safe:transition-opacity motion-safe:duration-150'
									: 'group-hover:invisible group-has-focus-visible:invisible')
						]}
					>
						<StandingIcon {standing} />
					</span>
				{/if}
				{#if archivable && primary && pillColor}
					<button
						type="button"
						class={[
							'pointer-events-none col-start-1 row-start-1 inline-flex h-6 w-0 items-center gap-1 overflow-hidden rounded-full text-xs font-medium whitespace-nowrap opacity-0 motion-safe:transition-all motion-safe:duration-150 motion-safe:ease-out',
							'group-hover:pointer-events-auto group-hover:w-max group-hover:px-2 group-hover:opacity-100 group-has-focus-visible:pointer-events-auto group-has-focus-visible:w-max group-has-focus-visible:px-2 group-has-focus-visible:opacity-100',
							pillColor
						]}
						style:interpolate-size="allow-keywords"
						aria-label="{primary.label} — {workspace.title}"
						onclick={() => actFromAfar(workspace, primary)}
					>
						{primary.label}
						<span class={[primary.icon, 'size-3.5']}></span>
					</button>
				{:else if archivable}
					<button
						type="button"
						class={[
							'invisible col-start-1 row-start-1 grid size-6 place-items-center rounded-control group-hover:visible group-has-focus-visible:visible hover:bg-hover',
							standing?.tone === 'merged' ? 'text-merged' : 'text-muted hover:text-ink'
						]}
						title="Archive workspace"
						aria-label="Archive {workspace.title}"
						onclick={() => archiveAndNavigate(workspace)}
					>
						<span class="icon-[lucide--archive] size-3.5"></span>
					</button>
				{/if}
			</span>
		</div>
	</li>
{/snippet}

{#snippet link(href: string, icon: string, label: string, current: boolean, needYou = 0)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolve()d hrefs -->
	<a
		{href}
		class={['item gap-2.5 px-2.5 py-1.5 text-base', current && 'item-active font-medium']}
		aria-current={current ? 'page' : undefined}
	>
		<span class={['size-4 shrink-0', icon]}></span>
		<span class="truncate">{label}</span>
		{#if needYou > 0}
			<span class="ml-auto" title="{needYou} need you"><Badge tone="accent">{needYou}</Badge></span>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
