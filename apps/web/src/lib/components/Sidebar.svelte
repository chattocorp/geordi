<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import Dialog from '#lib/ui/Dialog.svelte';
	import RepoPicker from '#lib/components/workspace/RepoPicker.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { settingsPath } from '#lib/components/settings.svelte.ts';
	import RowLabel from '@geordi/ui/RowLabel.svelte';
	import SidebarWorkspaceRow from './SidebarWorkspaceRow.svelte';
	import {
		actFromAfar,
		archiveAndNavigate,
		continueFromAfar,
		setInactive
	} from '#lib/components/workspace/afar.svelte.ts';
	import { beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import { pendingPullAction, pullActionPending } from '#lib/components/workspace/review.svelte.ts';
	import {
		asOneList,
		byRepository,
		dropTarget,
		inFocus,
		shownUngrouped,
		unfolded
	} from '#lib/family.ts';
	import { hint } from '@geordi/ui/keys';
	import { unread } from '#lib/notifications.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { foreground } from '#lib/foreground.svelte.ts';
	import {
		lockWorkspace,
		moveWorkspace,
		renameWorkspace,
		stopAgent
	} from '../../routes/workspaces.remote';
	import { moveRepo } from '../../routes/repos.remote';

	/**
	 * The sidebar groups workspaces by repository and keeps navigation links below the list. `nav` is what there is, once known; `path` is the
	 * page on screen, which is marked. `folded` is what is folded away: the workspaces of a
	 * repository under its name, and those its agents started under a workspace. `focus` is
	 * the repository shown alone, if any; `grouped` whether workspaces are listed under their
	 * repositories, or as one list, each with its repository's picture. `visibleWorkspaces` are those shown, `activeOnly` whether
	 * they leave out the inactive ones.
	 */
	let {
		nav,
		visibleWorkspaces = nav?.workspaces ?? [],
		path,
		folded,
		focus,
		grouped,
		activeOnly = $bindable(true),
		repositoryPickerOpen = $bindable(false),
		lost = false
	}: {
		nav: Navigation | undefined;
		visibleWorkspaces?: Navigation['workspaces'];
		path: string;
		folded: { current: string[] };
		focus: { current: string | null };
		grouped: { current: boolean };
		activeOnly?: boolean;
		repositoryPickerOpen?: boolean;
		lost?: boolean;
	} = $props();

	type Item = Navigation['workspaces'][number];

	/** The workspaces by repository, each agent-started one after the one that started it. */
	const listed = $derived(byRepository(visibleWorkspaces));
	const withWorkspaces = $derived(nav?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
	const sidebarRepos = $derived(inFocus(withWorkspaces, focus.current));
	const repoNames = $derived(new Map(nav?.repos.map((repo) => [repo.id, repo.name])));
	/**
	 * What the sidebar groups workspaces under: projects first (FDR-012: workspaces in no
	 * repository, `id` `null`), where there are any, then the repositories that have some.
	 * Focusing a repository leaves the projects, which are in none.
	 */
	const groups = $derived([
		...(listed.get(null)?.length ? [{ id: null, name: 'Projects' }] : []),
		...sidebarRepos.filter((repo) => listed.has(repo.id))
	]);
	/** All of them as one list, where they are not grouped: the projects, and the repositories shown. */
	const oneList = $derived(
		asOneList(
			shownUngrouped(
				visibleWorkspaces,
				sidebarRepos.map(({ id }) => id)
			)
		)
	);
	/** What stands for the projects among the folded: no repository has it as its ID. */
	const PROJECTS = 'projects';
	/** Whether anything is inactive: what an empty list, with inactive workspaces hidden, is down to. */
	const anyInactive = $derived(nav?.workspaces.some((workspace) => workspace.inactive) ?? false);

	/**
	 * Repositories and workspaces slide in and out whenever they come or go: by a filter (the
	 * focus, only the active ones) or on their own. Not when the list first arrives: it is drawn in
	 * `{#if nav}`, and a transition is local, so it plays only when its own block changes.
	 */
	const motion = () => ({
		duration: prefersReducedMotion.current ? 0 : MOTION,
		easing: cubicOut
	});
	/**
	 * A workspace counts as working, for archiving, while anything its agent started is. Not
	 * a project's: what it started in a repository carries on without it.
	 */
	const working = (workspace: Item): boolean =>
		workspace.working ||
		(workspace.repoId !== null &&
			(nav?.workspaces ?? []).some((other) => other.parentId === workspace.id && working(other)));
	/**
	 * The workspace, of this one and what its agents started, whose agent waits for the
	 * person's answer: a folded row stands for all of them, and must not hide a question.
	 */
	const asker = (workspace: Item): Item | undefined =>
		workspace.outcome === 'asking'
			? workspace
			: (nav?.workspaces ?? [])
					.filter((other) => other.parentId === workspace.id)
					.map(asker)
					.find((found) => found);
	/** The parent of the workspace the pointer is on: lit up, to show who it belongs to. */
	let pointedAt = $state<string | null>(null);

	/** The colour of what to do next, from how the workspace stands: as in its ribbon. */
	const actionTone = (standing: WorkspaceStanding | null): MenuTone =>
		standing?.tone === 'ok' || standing?.tone === 'merged' ? standing.tone : 'accent';

	let nameInput = $state<HTMLInputElement>();
	let renaming = $state<{ id: string; title: string; problem: string; saving: boolean } | null>(
		null
	);

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		const draft = renaming;
		if (!draft || draft.saving || !draft.title.trim()) return;
		draft.saving = true;
		try {
			await renameWorkspace({ workspaceId: draft.id, title: draft.title });
			if (renaming === draft) renaming = null;
		} catch (cause) {
			draft.problem = cause instanceof Error ? cause.message : 'Could not rename this workspace.';
		} finally {
			draft.saving = false;
		}
	}

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
				label: 'Rename workspace',
				icon: 'icon-[lucide--pencil]',
				onselect: () => {
					renaming = { id: workspace.id, title: workspace.title, problem: '', saving: false };
				}
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
			// put aside for later, until the person marks it active or next prompts it
			{
				label: workspace.inactive ? 'Mark as active' : 'Mark as inactive',
				icon: workspace.inactive ? 'icon-[lucide--activity]' : 'icon-[lucide--moon]',
				onselect: () => setInactive(workspace, !workspace.inactive, activeOnly)
			},
			{
				label: workspace.locked ? 'Unlock' : 'Lock',
				icon: workspace.locked ? 'icon-[lucide--lock-open]' : 'icon-[lucide--lock]',
				onselect: () => lockWorkspace({ workspaceId: workspace.id, locked: !workspace.locked })
			},
			// a locked workspace can't be archived (FDR-015)
			...(workspace.locked
				? []
				: [
						{
							label: 'Archive',
							icon: 'icon-[lucide--archive]',
							tone: 'merged' as const,
							disabled: beingArchived.has(workspace.id),
							onselect: () => archiveAndNavigate(workspace)
						}
					])
		];
	}

	type Row = { workspace: Item; parent: Item | null; depth: number };

	/**
	 * The workspace being dragged to another place among its siblings, and where it would
	 * go: above that workspace, `null` for below the last of them (`dropAfter`, the row the
	 * line shows under), `undefined` for nowhere new. What its agent started goes along; its
	 * parent stays the same.
	 */
	let dragged = $state<Item | null>(null);
	let dropBefore = $state<string | null | undefined>(undefined);
	let dropAfter = $state<string | null>(null);
	/** Whether the one being dragged may be dropped among `repoId`'s: in one list, anywhere. */
	const droppable = (repoId: string | null) =>
		!!dragged && (!grouped.current || dragged.repoId === repoId);

	function overRow(event: DragEvent & { currentTarget: HTMLElement }, rows: Row[], index: number) {
		const from = dragged ? rows.findIndex((row) => row.workspace.id === dragged!.id) : -1;
		if (from === -1) return;
		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		const target = dropTarget(rows, from, index, event.clientY < rect.top + rect.height / 2);
		if (event.dataTransfer) event.dataTransfer.dropEffect = target ? 'move' : 'none';
		dropBefore = target?.before;
		dropAfter = target?.after ?? null;
	}

	function drop(event: DragEvent, repoId: string | null) {
		event.preventDefault();
		if (dragged && droppable(repoId) && dropBefore !== undefined)
			void moveWorkspace({ workspaceId: dragged.id, before: dropBefore });
		endDrag();
	}

	function endDrag() {
		dragged = null;
		dropBefore = undefined;
		dropAfter = null;
	}

	/**
	 * The repository being dragged to another place among them, and where it would go: above
	 * that one, `null` for the end, `undefined` for nowhere new. The projects stay on top.
	 */
	let draggedRepo = $state<string | null>(null);
	let repoDropBefore = $state<string | null | undefined>(undefined);
	/** The repositories shown, in their order: what one is dragged among. */
	const shownRepos = $derived(groups.flatMap((group) => (group.id === null ? [] : [group.id])));

	/** Over a repository: above it on its upper half, else above the one after it. */
	function overRepo(event: DragEvent & { currentTarget: HTMLElement }, id: string) {
		if (!draggedRepo) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		const rect = event.currentTarget.getBoundingClientRect();
		const upper = event.clientY < rect.top + rect.height / 2;
		const before = shownRepos[shownRepos.indexOf(id) + (upper ? 0 : 1)] ?? null;
		// where it is already: above itself, or above the one after it
		const after = shownRepos[shownRepos.indexOf(draggedRepo) + 1] ?? null;
		repoDropBefore = before === draggedRepo || before === after ? undefined : before;
	}

	function dropRepo(event: DragEvent) {
		if (!draggedRepo) return;
		event.preventDefault();
		if (repoDropBefore !== undefined)
			void moveRepo({ repoId: draggedRepo, before: repoDropBefore });
		endRepoDrag();
	}

	function endRepoDrag() {
		draggedRepo = null;
		repoDropBefore = undefined;
	}

	const toggleFolded = (id: string) =>
		(folded.current = folded.current.includes(id)
			? folded.current.filter((other) => other !== id)
			: [...folded.current, id]);

	/** The two markers stay at the ends as groups expand, fold or move. */
	function watchScrollEdges(list: HTMLElement) {
		const top = list.firstElementChild!;
		const bottom = list.lastElementChild!;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					list.classList.toggle(
						entry.target === top ? 'more-above' : 'more-below',
						!entry.isIntersecting
					);
				}
			},
			{ root: list }
		);
		observer.observe(top);
		observer.observe(bottom);
		return () => observer.disconnect();
	}

	const settingsHint = hint('settings');
	const focusHint = hint('focusRepo');
	/**
	 * How far a workspace sits in from the one that started it, in one list: its picture under
	 * the title above (a row's label padding, its icon, and the gap after it, less where the
	 * smaller picture sits in its icon's place).
	 */
	const INDENT = 6.5;
	/** How long repositories and workspaces take to slide away or back, in milliseconds. */
	const MOTION = 200;
	const inSettings = $derived(path.startsWith('/settings'));
</script>

<Dialog
	label="Rename workspace"
	onopen={() => {
		nameInput?.focus();
		nameInput?.select();
	}}
	class="max-w-md"
	bind:open={
		() => !!renaming,
		(open) => {
			if (!open) renaming = null;
		}
	}
>
	{#if renaming}
		<form onsubmit={saveName} class="space-y-4 p-6">
			<h2 class="heading">Rename workspace</h2>
			<label class="block">
				<span class="label">Workspace name</span>
				<input
					class="mt-1 w-full input"
					maxlength="80"
					required
					value={renaming.title}
					oninput={(event) => {
						if (renaming) renaming.title = event.currentTarget.value;
					}}
					bind:this={nameInput}
				/>
			</label>
			{#if renaming.problem}<p role="alert" class="text-sm text-danger">{renaming.problem}</p>{/if}
			<div class="flex justify-end gap-2">
				<Button variant="soft" onclick={() => (renaming = null)}>Cancel</Button>
				<Button
					type="submit"
					variant="primary"
					busy={renaming.saving}
					disabled={!renaming.title.trim()}
				>
					Rename
				</Button>
			</div>
		</form>
	{/if}
</Dialog>

<div class="flex min-h-0 min-w-0 flex-1 flex-col sheet-quiet select-none">
	<nav class="flex min-h-0 flex-1 flex-col p-2" aria-label="Main">
		<div
			role="group"
			aria-label="Workspace filters"
			class="mb-2 flex shrink-0 items-center justify-between gap-1"
		>
			<RepoPicker
				all="All repositories"
				buttonIcon={false}
				title={`Search repositories (${hint('repositoryFilter')})`}
				bind:open={repositoryPickerOpen}
				repos={withWorkspaces}
				bind:value={() => focus.current ?? '', (value) => (focus.current = value || null)}
			/>
			<div class="tools">
				<Button
					variant="ghost"
					icon="icon-[lucide--list]"
					label="Show workspaces as one list"
					title={`Show workspaces as one list (${hint('groupByRepo')})`}
					aria-pressed={!grouped.current}
					onclick={() => (grouped.current = !grouped.current)}
				/>
				<Button
					variant="ghost"
					icon="icon-[lucide--activity]"
					label="Show only active workspaces"
					title={`Show only active workspaces (${hint('activeOnly')})`}
					aria-pressed={activeOnly}
					onclick={() => (activeOnly = !activeOnly)}
				/>
			</div>
		</div>

		<!--
			Each repository keeps its own space below it, rather than space between them: what
			slides away takes its space along, and nothing is left to jump when it is gone.
		-->
		<div class="scroller scroll-fade" {@attach watchScrollEdges}>
			<div aria-hidden="true"></div>
			{#if nav && !grouped.current}
				{@const rows = unfolded(oneList, folded.current)}
				<ul
					class="space-y-px pb-4"
					ondragleave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null))
							dropBefore = undefined;
					}}
				>
					{#each rows as { workspace, parent, depth, under }, index (workspace.id)}
						{@render row(workspace, parent, depth, under, rows, index)}
					{/each}
				</ul>
				{#if activeOnly && anyInactive && rows.length === 0}
					<p class="px-2 py-1 text-sm text-muted">All workspaces are inactive.</p>
				{/if}
			{:else if nav}
				{#each groups as repo (repo.id ?? PROJECTS)}
					{@const all = listed.get(repo.id) ?? []}
					{@const rows = unfolded(all, folded.current)}
					{@const isFolded = folded.current.includes(repo.id ?? PROJECTS)}
					{@const focused = focus.current === repo.id}
					{@const last = repo.id !== null && repo.id === shownRepos.at(-1)}
					<!-- where a repository being dragged would go: a line above this one, or below the last -->
					<div
						role="group"
						aria-label={repo.name}
						class={[
							'pb-4',
							repo.id !== null && draggedRepo === repo.id && 'opacity-60',
							repo.id !== null && repoDropBefore === repo.id && 'row-drop-before',
							last && repoDropBefore === null && 'row-drop-after'
						]}
						transition:slide={motion()}
						ondragover={(event) => repo.id !== null && overRepo(event, repo.id)}
						ondrop={dropRepo}
						ondragleave={(event) => {
							if (!event.currentTarget.contains(event.relatedTarget as Node | null))
								repoDropBefore = undefined;
						}}
					>
						<!--
				A label for what is under it: its picture, its name (quiet, by its colour: the
				workspaces are what is read here), and the way to start something in it. What is
				under it lines up with it: icon under picture, title under name. A repository is
				dragged by it, with the pointer only.
			-->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group relative flex h-7 items-center pr-1.5"
							draggable={repo.id !== null && shownRepos.length > 1}
							ondragstart={(event) => {
								draggedRepo = repo.id;
								event.dataTransfer?.setData('text/plain', repo.name);
								if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
							}}
							ondragend={endRepoDrag}
						>
							<RowLabel
								title={repo.name}
								fold={{
									folded: isFolded,
									count: all.length,
									unread: isFolded && all.some(({ workspace }) => unread.has(workspace.id)),
									toggle: () => toggleFolded(repo.id ?? PROJECTS)
								}}
								class="h-6 rounded-control text-sm font-semibold"
							>
								{#snippet icon()}
									{#if repo.id !== null}<RepoIcon id={repo.id} name={repo.name} />{:else}<span
											class="icon-[lucide--folders] size-5"
										></span>{/if}
								{/snippet}
							</RowLabel>
							{#if repo.id !== null}
								<Button
									variant="ghost"
									size="sm"
									icon="icon-[lucide--search]"
									class="invisible reveal:visible"
									label={focused ? 'Show all repositories' : `Show only ${repo.name}`}
									title={focused
										? `Show all repositories (${focusHint})`
										: `Show only ${repo.name} (${focusHint})`}
									aria-pressed={focused}
									onclick={() => (focus.current = focused ? null : repo.id)}
								/>
							{/if}
							<!-- no new projects (FDR-012): only repositories start something new -->
							{#if repo.id !== null}
								{@const newLabel = `New workspace in ${repo.name}`}
								<Button
									variant="ghost"
									size="sm"
									href={`${resolve('/')}?repo=${repo.id}`}
									icon="icon-[lucide--plus]"
									class="invisible reveal:visible"
									label={newLabel}
								/>
							{/if}
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
				{#if activeOnly && anyInactive && groups.length === 0}
					<p class="px-2 py-1 text-sm text-muted">All workspaces are inactive.</p>
				{/if}
			{/if}
			<div aria-hidden="true"></div>
		</div>
	</nav>

	<nav class="p-2" aria-label="Workspace navigation">
		<ConnectionIndicator {lost} class="px-2.5 py-1" />
		{@render link(resolve('/'), 'icon-[lucide--plus]', 'New workspace', path === '/')}
		{@render link(resolve('/archive'), 'icon-[lucide--archive]', 'Archive', path === '/archive')}
		<a
			href={settingsPath()}
			class={['item gap-2.5 px-2.5 py-1.5 text-base', inSettings && 'item-active font-medium']}
			aria-current={inSettings ? 'page' : undefined}
		>
			<span class="icon-[lucide--settings] size-4 shrink-0"></span>
			Settings
			<kbd class="ml-auto font-sans text-xs text-muted">{settingsHint}</kbd>
		</a>
	</nav>
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
	{@const asking = isFolded ? asker(workspace) : workspace.outcome === 'asking' && workspace}
	{@const leaving = beingArchived.has(workspace.id)}
	{#snippet repoIcon()}<RepoIcon
			id={workspace.repoId!}
			name={repoNames.get(workspace.repoId!) ?? ''}
			small
		/>{/snippet}
	<!-- one started by an agent sits a little in from the one that started it -->
	<!-- where a workspace being dragged would go: a line above this one, or below the last -->
	<li
		style:margin-inline-start="calc(var(--spacing) * {(grouped.current ? 3 : INDENT) * depth})"
		class={[
			dropBefore === workspace.id && 'row-drop-before',
			dropBefore === null && dropAfter === workspace.id && 'row-drop-after'
		]}
		transition:slide={motion()}
		{@attach contextMenu(() => (leaving ? [] : workspaceMenu(workspace)))}
		draggable={!leaving}
		ondragstart={(event) => {
			dragged = workspace;
			event.dataTransfer?.setData('text/plain', workspace.title);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		}}
		ondragend={endDrag}
		onclickcapture={(event) => {
			// with only active workspaces shown, shift-click marks one inactive: not on what the row has to click besides its link
			if (!activeOnly || !event.shiftKey || leaving) return;
			if (event.target instanceof Element && event.target.closest('button, [data-row-actions] a'))
				return;
			event.preventDefault();
			event.stopPropagation();
			void setInactive(workspace, true, activeOnly);
		}}
		ondblclick={(event) => {
			// not on what the row has to click besides its link
			if (event.target instanceof Element && event.target.closest('button, [data-row-actions] a'))
				return;
			foreground.ask(workspace.id);
		}}
		ondragover={(event) => overRow(event, rows, index)}
		ondrop={(event) => drop(event, workspace.repoId)}
	>
		<SidebarWorkspaceRow
			workspaceId={workspace.id}
			title={workspace.title}
			href={resolve('/workspaces/[id]', { id: workspace.id })}
			parentTitle={parent?.title}
			parentHref={grouped.current && workspace.parentId
				? resolve('/workspaces/[id]', { id: workspace.parentId })
				: undefined}
			icon={workspace.repoId === null
				? 'icon-[lucide--folder-kanban]'
				: grouped.current
					? undefined
					: repoIcon}
			{current}
			{leaving}
			dragging={dragged?.id === workspace.id}
			highlighted={pointedAt === workspace.id}
			unread={unread.has(workspace.id)}
			asking={asking ? resolve('/workspaces/[id]', { id: asking.id }) : false}
			waiting={workspace.waiting}
			working={workspace.working || (isFolded && busy)}
			locked={workspace.locked}
			inactive={workspace.inactive}
			background={workspace.background}
			progress={pendingPullAction.get(workspace.id) ??
				(workspace.actions.some((action) => pullActionPending(workspace.id, action))
					? 'merge-pull'
					: workspace.activeAction)}
			standing={workspace.standing}
			actions={workspace.actions}
			fold={under > 0
				? { count: under, folded: isFolded, toggle: () => toggleFolded(workspace.id) }
				: undefined}
			onpoint={(pointed) => (pointedAt = pointed ? (parent?.id ?? null) : null)}
			onaction={busy || leaving ? undefined : (action) => actFromAfar(workspace, action)}
		/>
	</li>
{/snippet}

{#snippet link(href: string, icon: string, label: string, current: boolean)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolve()d hrefs -->
	<a
		{href}
		class={['item gap-2.5 px-2.5 py-1.5 text-base', current && 'item-active font-medium']}
		aria-current={current ? 'page' : undefined}
	>
		<span class={['size-4 shrink-0', icon]}></span>
		<span class="truncate">{label}</span>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
