<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import Dialog from '#lib/ui/Dialog.svelte';
	import RepoPicker from '#lib/components/workspace/RepoPicker.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { settingsPath } from '#lib/components/settings.svelte.ts';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import {
		actFromAfar,
		archiveAndNavigate,
		continueFromAfar,
		setInactive
	} from '#lib/components/workspace/afar.svelte.ts';
	import { beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import { pendingPullAction, pullActionPending } from '#lib/components/workspace/review.svelte.ts';
	import { outlineRows, zoomedInto, zoomTrail } from '#lib/family.ts';
	import Outline, { type WorkspaceRowProps } from './Outline.svelte';
	import { hint } from '@geordi/ui/keys';
	import { unread } from '#lib/notifications.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import type { MenuItem, MenuTone } from '#lib/ui/menu.svelte.ts';
	import { foreground } from '#lib/foreground.svelte.ts';
	import { lockWorkspace, renameWorkspace, stopAgent } from '../../routes/workspaces.remote';

	/**
	 * The sidebar is the outline (FDR-019): every item, workspaces among them, and the
	 * navigation links below it. `nav` is what there is, once known; `path` is the page on
	 * screen, which is marked. `folded` is what is folded away under items; `focus` the
	 * repository shown alone, if any; `zoom` the item zoomed into, if any (its branch is all
	 * that shows); `activeOnly` whether what is done or inactive is left out.
	 */
	let {
		nav,
		path,
		folded,
		focus,
		zoom,
		activeOnly = $bindable(true),
		repositoryPickerOpen = $bindable(false),
		lost = false
	}: {
		nav: Navigation | undefined;
		path: string;
		folded: { current: string[] };
		focus: { current: string | null };
		zoom: { current: string | null; from?: string | null; back?: () => void };
		activeOnly?: boolean;
		repositoryPickerOpen?: boolean;
		lost?: boolean;
	} = $props();

	type Item = Navigation['workspaces'][number];

	const withWorkspaces = $derived(nav?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
	const repoNames = $derived(new Map(nav?.repos.map((repo) => [repo.id, repo.name])));
	/** The workspaces in use, by ID: what the outline's items with workspaces show. */
	const workspaceById = $derived(new Map(nav?.workspaces.map((each) => [each.id, each])));
	const viewed = $derived(path.match(/^\/workspaces\/([^/]+)$/)?.[1] ?? null);
	/** The rows shown, top to bottom. */
	const rows = $derived(
		nav
			? outlineRows(zoomedInto(nav.items, zoom.current), nav.workspaces, {
					activeOnly,
					focus: focus.current,
					folded: folded.current,
					viewed
				})
			: []
	);
	/** The way down to the item zoomed into; empty while not zoomed, or when it is gone. */
	const trail = $derived(nav ? zoomTrail(nav.items, zoom.current) : []);
	/** Back to where it was zoomed into before, where that is known. */
	const back = $derived.by(() => {
		const from = zoom.from;
		if (from === undefined || !zoom.back) return undefined;
		const text = from === null ? 'Outline' : nav?.items.find(({ id }) => id === from)?.text;
		return { text: text || 'Untitled', go: zoom.back };
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
	function workspaceMenu(
		workspace: Item,
		{ add, zoom }: { add: () => void; zoom?: () => void }
	): MenuItem[] {
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
			// its own todos (FDR-019)
			...(project
				? []
				: [
						{
							label: 'Add an item under it',
							icon: 'icon-[lucide--list-plus]',
							onselect: add
						},
						...(zoom ? [{ label: 'Zoom in', icon: 'icon-[lucide--zoom-in]', onselect: zoom }] : [])
					]),
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
			// a pixel's leeway: rows of fractional height can leave the end a hair out of reach
			{ root: list, rootMargin: '1px' }
		);
		observer.observe(top);
		observer.observe(bottom);
		return () => observer.disconnect();
	}

	const settingsHint = hint('settings');
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
					icon="icon-[lucide--activity]"
					label="Show only what is active"
					title={`Show only what is active: no archived or inactive workspaces (${hint('activeOnly')})`}
					aria-pressed={activeOnly}
					onclick={() => (activeOnly = !activeOnly)}
				/>
			</div>
		</div>

		<div class="scroller -mx-2 scroll-fade px-2" {@attach watchScrollEdges}>
			<div aria-hidden="true"></div>
			{#if nav}
				<Outline
					{rows}
					{folded}
					{pointedAt}
					{trail}
					{back}
					root={trail.at(-1)?.id ?? null}
					onzoom={(id) => (zoom.current = id)}
					live={(id) => workspaceById.has(id)}
					draggable={(id) => !beingArchived.has(id)}
					workspaceMenu={(entry, actions) => {
						const workspace = workspaceById.get(entry.id);
						return workspace ? workspaceMenu(workspace, actions) : [];
					}}
				>
					{#snippet workspace(row)}{@render workspaceRow(row)}{/snippet}
				</Outline>
				{#if rows.length === 0 && nav.items.length > 0 && !trail.length}
					<p class="px-2 py-1 text-sm text-muted">Everything is done or put aside.</p>
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

{#snippet workspaceRow({ entry, parent, fold, isFolded, dragging, target }: WorkspaceRowProps)}
	{@const workspace = workspaceById.get(entry.id)!}
	{@const current = path === `/workspaces/${entry.id}`}
	{@const busy = working(workspace)}
	{@const asking = isFolded ? asker(workspace) : workspace.outcome === 'asking' && workspace}
	{@const leaving = beingArchived.has(entry.id)}
	{#snippet repoIcon()}<RepoIcon
			id={workspace.repoId!}
			name={repoNames.get(workspace.repoId!) ?? ''}
			small
		/>{/snippet}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="contents"
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
	>
		<WorkspaceRow
			title={workspace.title}
			href={resolve('/workspaces/[id]', { id: workspace.id })}
			parentTitle={parent?.text}
			icon={workspace.repoId === null ? 'icon-[lucide--folder-kanban]' : repoIcon}
			{current}
			{leaving}
			{dragging}
			highlighted={pointedAt === workspace.id || target}
			unread={unread.has(workspace.id)}
			asking={asking ? resolve('/workspaces/[id]', { id: asking.id }) : false}
			waiting={workspace.waiting}
			working={workspace.working || (isFolded && busy)}
			locked={workspace.locked}
			inactive={workspace.inactive}
			progress={pendingPullAction.get(workspace.id) ??
				(workspace.actions.some((action) => pullActionPending(workspace.id, action))
					? 'merge-pull'
					: workspace.activeAction)}
			standing={workspace.standing}
			actions={workspace.actions}
			{fold}
			foldAside
			onpoint={(pointed) => (pointedAt = pointed ? (parent?.id ?? null) : null)}
			onaction={busy || leaving ? undefined : (action) => actFromAfar(workspace, action)}
		/>
	</div>
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
