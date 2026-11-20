<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { settingsPath } from '#lib/components/settings.svelte.ts';
	import SidebarRowLabel from '@geordi/ui/SidebarRowLabel.svelte';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import {
		actFromAfar,
		archiveAndNavigate,
		continueFromAfar
	} from '#lib/components/workspace/afar.svelte.ts';
	import { beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import { pendingPullAction, pullActionPending } from '#lib/components/workspace/review.svelte.ts';
	import { byRepository, inFocus, unfolded } from '#lib/family.ts';
	import { hint } from '@geordi/ui/keys';
	import { unread } from '#lib/notifications.svelte.ts';
	import { lanes } from '#lib/overview.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Badge from '@geordi/ui/Badge.svelte';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
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
	/**
	 * What the sidebar groups workspaces under: projects first (FDR-012: workspaces in no
	 * repository, `id` `null`), where there are any, then the repositories that have some.
	 * Focusing a repository leaves the projects, which are in none.
	 */
	const groups = $derived([
		...(listed.get(null)?.length ? [{ id: null, name: 'Projects' }] : []),
		...sidebarRepos
	]);
	/** What stands for the projects among the folded: no repository has it as its ID. */
	const PROJECTS = 'projects';
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
	/**
	 * A workspace counts as working, for archiving, while anything its agent started is. Not
	 * a project's: what it started in a repository carries on without it.
	 */
	const working = (workspace: Item): boolean =>
		workspace.working ||
		(workspace.repoId !== null &&
			(nav?.workspaces ?? []).some((other) => other.parentId === workspace.id && working(other)));
	/** The parent of the workspace the pointer is on: lit up, to show who it belongs to. */
	let pointedAt = $state<string | null>(null);

	/** The colour of what to do next, from how the workspace stands: as in its ribbon. */
	const actionTone = (standing: WorkspaceStanding | null): MenuTone =>
		standing?.tone === 'ok' || standing?.tone === 'merged' ? standing.tone : 'accent';

	/** What can be done with a workspace from the sidebar, without opening it. */
	function workspaceMenu(workspace: Item): MenuItem[] {
		const href = resolve('/workspaces/[id]', { id: workspace.id });
		const running = workspace.status === 'running';
		const project = workspace.repoId === null;
		// archiving takes the workspaces its agent started along: none of them may be working
		const busy = working(workspace);
		// the menu has these already, below
		const next = workspace.actions.filter(({ id }) => id !== 'continue' && id !== 'archive');
		return [
			...next.map((action) => ({
				label: action.label,
				icon: action.icon,
				tone: actionTone(workspace.standing),
				disabled: pullActionPending(workspace.id, action),
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
			// a project has no branch to copy or carry on from
			...(project
				? []
				: [
						{
							label: 'Copy branch name',
							icon: 'icon-[lucide--git-branch]',
							disabled: !workspace.branch,
							onselect: () => navigator.clipboard.writeText(workspace.branch ?? '')
						}
					]),
			'separator',
			...(project
				? []
				: [
						{
							label: 'Continue on a new branch',
							icon: 'icon-[lucide--git-branch-plus]',
							disabled: busy,
							onselect: () => continueFromAfar(workspace)
						}
					]),
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

	function drop(event: DragEvent, repoId: string | null) {
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
			{#each groups as repo (repo.id ?? PROJECTS)}
				{@const all = listed.get(repo.id) ?? []}
				{@const rows = unfolded(all, folded.current)}
				{@const isFolded = folded.current.includes(repo.id ?? PROJECTS)}
				{@const focused = focus.current === repo.id}
				{@const newHref = `${resolve('/')}?${repo.id === null ? 'project' : `repo=${repo.id}`}`}
				{@const newLabel = repo.id === null ? 'New project' : `New workspace in ${repo.name}`}
				<div class="pb-4" transition:slide={motion()}>
					<!--
				A label for what is under it: its picture, its name (quiet, by its colour: the
				workspaces are what is read here), and the way to start something in it. What is
				under it lines up with it: icon under picture, title under name.
			-->
					<div class="group relative flex h-7 items-center pr-1.5">
						<SidebarRowLabel
							title={repo.name}
							href={repo.id !== null ? resolve('/repos/[id]', { id: repo.id }) : undefined}
							current={repo.id !== null && path === resolve('/repos/[id]', { id: repo.id })}
							fold={{
								folded: isFolded,
								count: all.length,
								toggle: () => toggleFolded(repo.id ?? PROJECTS)
							}}
							class="h-6 rounded-control text-sm font-semibold text-muted hover:text-ink aria-[current=page]:text-ink"
						>
							{#snippet icon()}
								{#if repo.id !== null}<RepoIcon id={repo.id} />{:else}<span
										class="icon-[lucide--folders] size-5"
									></span>{/if}
							{/snippet}
						</SidebarRowLabel>
						{#if repo.id !== null}
							<button
								type="button"
								class={[
									'invisible grid size-6 shrink-0 place-items-center rounded-control hover:bg-sunken hover:text-ink reveal:visible',
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
						{/if}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus which repository -->
						<a
							href={newHref}
							class="invisible grid size-6 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink reveal:visible"
							title={newLabel}
							aria-label={newLabel}
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
		{@attach contextMenu(() => (leaving ? [] : workspaceMenu(workspace)))}
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
		<WorkspaceRow
			title={workspace.title}
			href={resolve('/workspaces/[id]', { id: workspace.id })}
			parentTitle={parent?.title}
			child={!!workspace.parentId}
			icon={workspace.repoId === null ? 'icon-[lucide--folder-kanban]' : undefined}
			{current}
			{leaving}
			dragging={dragged?.id === workspace.id}
			highlighted={pointedAt === workspace.id}
			unread={unread.has(workspace.id)}
			asking={workspace.outcome === 'asking'}
			waiting={workspace.waiting}
			working={workspace.working || (isFolded && busy)}
			progress={pendingPullAction.get(workspace.id) ??
				(workspace.actions.some((action) => pullActionPending(workspace.id, action))
					? 'Merging pull request'
					: undefined)}
			standing={workspace.standing}
			actions={workspace.actions}
			fold={under > 0
				? { count: under, folded: isFolded, toggle: () => toggleFolded(workspace.id) }
				: undefined}
			onpoint={(pointed) => (pointedAt = pointed ? (parent?.id ?? null) : null)}
			onaction={busy || leaving ? undefined : (action) => actFromAfar(workspace, action)}
			onarchive={busy || leaving ? undefined : () => archiveAndNavigate(workspace)}
		/>
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
