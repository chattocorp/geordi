<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Button from '@geordi/ui/Button.svelte';
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
	import type { Navigation } from '#lib/server/views.ts';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { moveWorkspace, renameWorkspace, stopAgent } from '../../routes/workspaces.remote';
	import { moveRepo } from '../../routes/repos.remote';

	/**
	 * The sidebar groups workspaces by repository and keeps navigation links below the list. `nav` is what there is, once known; `path` is the
	 * page on screen, which is marked. `folded` is what is folded away: the workspaces of a
	 * repository under its name, and those its agents started under a workspace. `focus` is
	 * the repository shown alone, if any. `visibleWorkspaces` are those shown, `todayOnly` whether
	 * they are only those active today.
	 */
	let {
		nav,
		visibleWorkspaces = nav?.workspaces ?? [],
		path,
		folded,
		focus,
		todayOnly = $bindable(false),
		repositoryPickerOpen = $bindable(false),
		lost = false
	}: {
		nav: Navigation | undefined;
		visibleWorkspaces?: Navigation['workspaces'];
		path: string;
		folded: { current: string[] };
		focus: { current: string | null };
		todayOnly?: boolean;
		repositoryPickerOpen?: boolean;
		lost?: boolean;
	} = $props();

	type Item = Navigation['workspaces'][number];

	/** The workspaces by repository, each agent-started one after the one that started it. */
	const listed = $derived(byRepository(visibleWorkspaces));
	const withWorkspaces = $derived(nav?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
	const sidebarRepos = $derived(inFocus(withWorkspaces, focus.current));
	/**
	 * What the sidebar groups workspaces under: projects first (FDR-012: workspaces in no
	 * repository, `id` `null`), where there are any, then the repositories that have some.
	 * Focusing a repository leaves the projects, which are in none.
	 */
	const groups = $derived([
		...(listed.get(null)?.length ? [{ id: null, name: 'Projects' }] : []),
		...sidebarRepos.filter((repo) => listed.has(repo.id))
	]);
	/** What stands for the projects among the folded: no repository has it as its ID. */
	const PROJECTS = 'projects';
	const repositoryOptions = $derived([
		{ value: '', label: 'All repositories' },
		...withWorkspaces.map(({ id, name }) => ({ value: id, label: name }))
	]);

	/**
	 * Repositories and workspaces slide in and out whenever they come or go: by a filter (the
	 * focus, today only) or on their own. Not when the list first arrives: it is drawn in
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
					disabled={!renaming.title.trim()}>Rename</Button
				>
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
			<Select
				label="Repository"
				title={`Search repositories (${hint('repositoryFilter')})`}
				bind:open={repositoryPickerOpen}
				options={repositoryOptions}
				bind:value={() => focus.current ?? '', (value) => (focus.current = value || null)}
			/>
			<Button
				variant="ghost"
				icon="icon-[lucide--calendar-days]"
				label="Show workspaces active today"
				title={`Show workspaces active today (${hint('todayOnly')})`}
				aria-pressed={todayOnly}
				class="aria-pressed:bg-sunken aria-pressed:text-ink"
				onclick={() => (todayOnly = !todayOnly)}
			/>
		</div>

		<!--
			Each repository keeps its own space below it, rather than space between them: what
			slides away takes its space along, and nothing is left to jump when it is gone.
		-->
		<div class="scroller scroll-fade" {@attach watchScrollEdges}>
			<div aria-hidden="true"></div>
			{#if nav}
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
							<SidebarRowLabel
								title={repo.name}
								fold={{
									folded: isFolded,
									count: all.length,
									toggle: () => toggleFolded(repo.id ?? PROJECTS)
								}}
								class="h-6 rounded-control text-sm font-semibold text-muted hover:text-ink"
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
							<!-- no new projects (FDR-012): only repositories start something new -->
							{#if repo.id !== null}
								{@const newLabel = `New workspace in ${repo.name}`}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus which repository -->
								<a
									href={`${resolve('/')}?repo=${repo.id}`}
									class="invisible grid size-6 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink reveal:visible"
									title={newLabel}
									aria-label={newLabel}
								>
									<span class="icon-[lucide--plus] size-4"></span>
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
				{#if todayOnly && groups.length === 0}
					<p class="px-2 py-1 text-sm text-muted">No workspaces active today.</p>
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
		transition:slide={motion()}
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
			parentHref={workspace.parentId
				? resolve('/workspaces/[id]', { id: workspace.parentId })
				: undefined}
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
