<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceStanding } from '#lib/actions.ts';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import StandingIcon from '#lib/components/StandingIcon.svelte';
	import {
		actFromAfar,
		archiveAndNavigate,
		continueFromAfar
	} from '#lib/components/workspace/afar.svelte.ts';
	import { beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import { pendingPullAction } from '#lib/components/workspace/review.svelte.ts';
	import { byRepository } from '#lib/family.ts';
	import { modifierKey } from '#lib/keys.ts';
	import { unread } from '#lib/notifications.svelte.ts';
	import { lanes } from '#lib/overview.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
	import Spinner from '#lib/ui/Spinner.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { hideWorkspace, moveWorkspace, stopAgent } from '../../routes/workspaces.remote';

	/**
	 * The sidebar's sheet: where to go (the overview, a new workspace), the workspaces by
	 * repository, and the settings below. `nav` is what there is, once known; `path` is the
	 * page on screen, which is marked.
	 */
	let {
		nav,
		path,
		lost = false
	}: { nav: Navigation | undefined; path: string; lost?: boolean } = $props();

	type Item = Navigation['workspaces'][number];

	const all = $derived(nav?.workspaces ?? []);
	const byId = $derived(new Map(all.map((workspace) => [workspace.id, workspace])));
	/** Hidden by the person, or started by an agent in a workspace that is. */
	const hidden = (workspace: Item): boolean => {
		const seen: string[] = []; // a cycle ends the climb
		let at: Item | undefined = workspace;
		while (at && !seen.includes(at.id)) {
			if (at.hidden) return true;
			seen.push(at.id);
			at = byId.get(at.parentId ?? '');
		}
		return false;
	};
	/** A hidden workspace still shows while its agent asks something. */
	const stowed = (workspace: Item) => hidden(workspace) && workspace.outcome !== 'asking';
	/** The workspaces by repository, each agent-started one after the one that started it. */
	const listed = $derived(byRepository(all.filter((workspace) => !stowed(workspace))));
	/** The hidden ones, listed the same way, under the others when asked for. */
	const stowedAway = $derived(byRepository(all.filter(stowed)));
	/** The repositories whose hidden workspaces are on show, until the page is reloaded. */
	const revealed = new SvelteSet<string>();
	const toggleRevealed = (id: string) =>
		revealed.has(id) ? revealed.delete(id) : revealed.add(id);
	const sidebarRepos = $derived(nav?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
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
			workspace.hidden
				? {
						label: 'Show in sidebar',
						icon: 'icon-[lucide--eye]',
						onselect: () => hideWorkspace({ workspaceId: workspace.id, hidden: false })
					}
				: {
						label: 'Hide',
						icon: 'icon-[lucide--eye-off]',
						onselect: () => hideWorkspace({ workspaceId: workspace.id, hidden: true })
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

	/** Whether the workspace being dragged is in `rows`: it moves within its own list only. */
	const draggedIn = (rows: Row[]) => rows.some((row) => row.workspace.id === dragged?.id);

	/** Over a row: above it, if that stands at the top and the pointer is on its upper half; else above the next that does. */
	function overRow(event: DragEvent & { currentTarget: HTMLElement }, rows: Row[], index: number) {
		// within its own list only: its repository's, visible or hidden
		if (!dragged || !draggedIn(rows)) {
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

	/** The repositories whose workspaces are folded away under their name. */
	const folded = persisted<string[]>('geordi:folded', []);
	const toggleFolded = (id: string) =>
		(folded.current = folded.current.includes(id)
			? folded.current.filter((other) => other !== id)
			: [...folded.current, id]);
	const settingsHint = `${modifierKey()},`;
</script>

<div class="flex min-h-0 flex-1 flex-col sheet-quiet">
	<nav class="flex-1 space-y-6 overflow-y-auto p-2" aria-label="Main">
		<div class="space-y-0.5">
			{@render link(
				resolve('/overview'),
				'icon-[lucide--layout-list]',
				'Overview',
				path === '/overview',
				needYou
			)}
			{@render link(resolve('/'), 'icon-[lucide--plus]', 'New workspace', path === '/')}
		</div>

		<div class="space-y-4">
			{#each sidebarRepos as repo (repo.id)}
				{@const rows = listed.get(repo.id) ?? []}
				{@const hiddenRows = stowedAway.get(repo.id) ?? []}
				{@const isRevealed = revealed.has(repo.id)}
				{@const isFolded = folded.current.includes(repo.id)}
				<div>
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
								<span class="shrink-0 font-normal text-muted/60 tabular-nums">{rows.length}</span>
							{/if}
						</button>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus which repository -->
						<a
							href="{resolve('/')}?repo={repo.id}"
							class="invisible grid size-6 shrink-0 place-items-center rounded-control text-muted group-hover:visible group-has-focus-visible:visible hover:bg-sunken hover:text-ink"
							title="New workspace in {repo.name}"
							aria-label="New workspace in {repo.name}"
						>
							<span class="icon-[lucide--plus] size-4"></span>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
					{#if !isFolded}
						{@render list(rows)}
						{#if hiddenRows.length > 0}
							<button
								type="button"
								class="flex h-7 w-full items-center gap-2 rounded-control pr-1.5 pl-1.5 text-left text-xs text-muted hover:text-ink"
								aria-expanded={isRevealed}
								onclick={() => toggleRevealed(repo.id)}
							>
								<!-- under the rows' icons, as wide as they are -->
								<span class="grid size-5 shrink-0 place-items-center">
									<!-- as every disclosure has it: pointing at what opens below, once open -->
									<span
										aria-hidden="true"
										class={[
											'icon-[lucide--chevron-right] size-3.5 transition-transform motion-reduce:transition-none',
											isRevealed && 'rotate-90'
										]}
									></span>
								</span>
								{isRevealed ? 'Show fewer' : `Show ${hiddenRows.length} hidden`}
							</button>
							<!-- the hidden ones, below what reveals them -->
							{#if isRevealed}
								{@render list(hiddenRows)}
							{/if}
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</nav>

	<div class="p-2">
		<ConnectionIndicator {lost} class="px-2.5 py-1" />
		<button
			type="button"
			class="item w-full gap-2.5 px-2.5 py-1.5 text-base"
			onclick={() => openSettings()}
		>
			<span class="icon-[lucide--settings] size-4 shrink-0"></span>
			Settings
			<kbd class="ml-auto font-sans text-xs text-muted">{settingsHint}</kbd>
		</button>
	</div>
</div>

{#snippet list(rows: Row[])}
	<ul
		class="space-y-px"
		ondragleave={(event) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dropBefore = undefined;
		}}
	>
		{#each rows as { workspace, parent, depth }, index (workspace.id)}
			{@render row(workspace, parent, depth, rows, index)}
		{/each}
	</ul>
{/snippet}

{#snippet row(workspace: Item, parent: Item | null, depth: number, rows: Row[], index: number)}
	{@const current = path === `/workspaces/${workspace.id}`}
	{@const busy = working(workspace)}
	{@const leaving = beingArchived.has(workspace.id)}
	<!-- Routine publishing steps only need to appear inside the workspace. -->
	{@const standing = leaving || workspace.standing?.tone === 'accent' ? null : workspace.standing}
	{@const archivable = !busy && !leaving}
	<!-- one started by an agent sits a little in from the one that started it -->
	<!-- where a workspace being dragged would go: a line above this one, or below the last -->
	<li
		style:margin-inline-start="calc(var(--spacing) * {3 * depth})"
		class={[
			dropBefore === workspace.id && 'row-drop-before',
			dropBefore === null && index === rows.length - 1 && draggedIn(rows) && 'row-drop-after'
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
				'group item pr-1 text-base',
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
				<span class="grid size-5 shrink-0 place-items-center text-muted/80">
					{#if leaving}
						<Spinner label="Archiving" />
					{:else if workspace.outcome === 'asking'}
						<!-- an agent there waits for the person's answer -->
						<span class="icon-[lucide--message-circle-question] size-4 text-accent-ink"></span>
					{:else if workspace.working}
						<!-- its agent, or one working alongside it -->
						<Spinner />
					{:else if workspace.hidden}
						<!-- out of sight, unless asked for -->
						<span class="icon-[lucide--eye-off] size-4"></span>
					{:else if workspace.parentId}
						<!-- started by an agent: the one above it, where that is still around -->
						<span class="icon-[lucide--corner-down-right] size-4"></span>
					{:else}
						<span class="icon-[lucide--git-branch] size-4"></span>
					{/if}
				</span>
				<span class="min-w-0 flex-1 truncate">{workspace.title}</span>
			</a>
			<!--
				At its end: how its work stands, at a glance. Pointed at, that makes way for what
				can be done with it; the two share one place, so that nothing moves.
			-->
			<!-- side by side, without the row's gap between them -->
			<span class="flex shrink-0 items-center">
				{#if archivable && (workspace.hidden || !hidden(workspace))}
					<!-- put out of sight, or brought back: only where it was hidden itself -->
					<button
						type="button"
						class="hidden size-6 shrink-0 place-items-center rounded-control text-muted group-hover:grid group-has-focus-visible:grid hover:bg-sunken hover:text-ink"
						title={workspace.hidden ? 'Show in sidebar' : 'Hide workspace'}
						aria-label="{workspace.hidden ? 'Show' : 'Hide'} {workspace.title}"
						onclick={() => hideWorkspace({ workspaceId: workspace.id, hidden: !workspace.hidden })}
					>
						<span
							class={[
								'size-3.5',
								workspace.hidden ? 'icon-[lucide--eye]' : 'icon-[lucide--eye-off]'
							]}
						></span>
					</button>
				{/if}
				<span class="grid size-6 shrink-0 place-items-center">
					{#if standing}
						<span
							class={[
								'col-start-1 row-start-1',
								archivable && 'group-hover:invisible group-has-focus-visible:invisible'
							]}
						>
							<StandingIcon {standing} />
						</span>
					{/if}
					{#if archivable}
						<button
							type="button"
							class={[
								'invisible col-start-1 row-start-1 grid size-6 place-items-center rounded-control group-hover:visible group-has-focus-visible:visible hover:bg-sunken',
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
