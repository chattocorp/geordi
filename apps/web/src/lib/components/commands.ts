import type { Command } from '#lib/commands.ts';
import type { Navigation } from '#lib/server/views.ts';
import type { Section } from '#lib/components/settings.svelte.ts';
import type { Theme } from '#lib/theme.svelte.ts';
import { lineOf, nested, withoutTodos } from '#lib/family.ts';

/** Where Geordi stands, and what it can be asked to do, from anywhere. */
export type Everywhere = {
	nav: Navigation | undefined;
	/** The workspace on screen, if any. */
	viewed: string | null;
	/** The workspaces' IDs, the most recently active first: the order to list them in. */
	recency: string[];
	anyUnread: boolean;
	sidebarOpen: boolean;
	/** Whether the window is wide enough to show the sidebar. */
	wide: boolean;
	/** Whether the sidebar shows only the active workspaces, leaving out the inactive ones. */
	activeOnly: boolean;
	/** The repository the sidebar shows alone, if any. */
	focus: string | null;
	theme: Theme;
	sections: readonly { id: Section; label: string; icon: string }[];

	newWorkspace(choosing?: boolean): void;
	/** Asks where to move the workspace on screen. */
	moveWorkspace(): void;
	open(workspace: string): void;
	step(to: 1 | -1 | 'unread'): void;
	addRepository(): void;
	openArchive(): void;
	openSettings(section?: Section): void;
	toggleSidebar(): void;
	filterRepositories(): void;
	toggleActiveOnly(): void;
	setFocus(repo: string | null): void;
	setTheme(theme: Theme): void;
};

/** What can be done from anywhere: the global command palette, and the shortcuts of the layout. */
export function globalCommands(at: Everywhere): Command[] {
	const repos = at.nav?.repos ?? [];
	const repoName = new Map(repos.map((repo) => [repo.id, repo.name]));
	const general = 'General';
	const commands: Command[] = [
		{
			id: 'new-workspace',
			label: 'New workspace',
			group: general,
			icon: 'icon-[lucide--plus]',
			shortcut: 'newWorkspace',
			run: () => at.newWorkspace()
		},
		{
			id: 'new-workspace-in',
			label: 'New workspace in…',
			group: general,
			icon: 'icon-[lucide--folder-plus]',
			shortcut: 'newWorkspaceIn',
			run: () => at.newWorkspace(true)
		},
		// a workspace in the outline: not a project, which nothing is put under or above
		...(at.nav?.workspaces.some(({ id, repoId }) => id === at.viewed && repoId !== null)
			? [
					{
						id: 'move-workspace',
						label: 'Move this workspace under…',
						group: general,
						icon: 'icon-[lucide--corner-down-right]',
						shortcut: 'moveWorkspace' as const,
						run: at.moveWorkspace
					}
				]
			: []),
		{
			id: 'previous-workspace',
			label: 'Previous workspace',
			group: general,
			icon: 'icon-[lucide--arrow-up]',
			shortcut: 'previousWorkspace',
			repeats: true,
			run: () => at.step(-1)
		},
		{
			id: 'next-workspace',
			label: 'Next workspace',
			group: general,
			icon: 'icon-[lucide--arrow-down]',
			shortcut: 'nextWorkspace',
			repeats: true,
			run: () => at.step(1)
		},
		{
			id: 'next-unread',
			label: 'Next unread workspace',
			group: general,
			icon: 'icon-[lucide--mail]',
			shortcut: 'nextUnreadWorkspace',
			unlisted: !at.anyUnread,
			run: () => at.step('unread')
		},
		{
			id: 'add-repository',
			label: 'Add repository…',
			group: general,
			icon: 'icon-[lucide--folder-git-2]',
			run: at.addRepository
		},
		{
			id: 'archive',
			label: 'Archive',
			group: general,
			icon: 'icon-[lucide--archive]',
			run: at.openArchive
		}
	];

	// in the order they were in when the palette opened (agents at work don't move them); the
	// one on screen last, marked as current: it can be found, though there is nowhere to go
	const rank = (id: string) => (at.recency.indexOf(id) + 1 || Infinity) as number;
	const all = at.nav?.workspaces ?? [];
	const workspaces = [
		...all.filter(({ id }) => id !== at.viewed).sort((a, b) => rank(a.id) - rank(b.id)),
		...all.filter(({ id }) => id === at.viewed)
	];
	for (const workspace of workspaces) {
		const current = workspace.id === at.viewed;
		const where = workspace.repoId ? repoName.get(workspace.repoId) : 'Project';
		commands.push({
			id: `workspace:${workspace.id}`,
			label: workspace.title,
			group: 'Workspaces',
			icon: workspace.repoId ? 'icon-[lucide--git-branch]' : 'icon-[lucide--folder-kanban]',
			// its repository's picture, as in the outline
			...(workspace.repoId && {
				repo: { id: workspace.repoId, name: repoName.get(workspace.repoId) ?? '' }
			}),
			detail: current ? [where, 'current'].filter(Boolean).join(' · ') : where,
			keywords: workspace.branch ?? undefined,
			run: () => (current ? undefined : at.open(workspace.id))
		});
	}

	const sidebar = 'Sidebar';
	commands.push(
		{
			id: 'toggle-sidebar',
			label: at.sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
			group: sidebar,
			icon: at.sidebarOpen ? 'icon-[lucide--panel-left-close]' : 'icon-[lucide--panel-left-open]',
			shortcut: 'toggleSidebar',
			run: at.toggleSidebar
		},
		{
			id: 'filter-repositories',
			label: 'Filter by repository…',
			group: sidebar,
			icon: 'icon-[lucide--filter]',
			shortcut: 'repositoryFilter',
			unlisted: !at.wide,
			run: at.filterRepositories
		},
		{
			id: 'active-only',
			label: at.activeOnly
				? 'Show archived and inactive workspaces too'
				: 'Show only what is active',
			group: sidebar,
			icon: 'icon-[lucide--activity]',
			shortcut: 'activeOnly',
			run: at.toggleActiveOnly
		}
	);
	// The focus shortcut shows only the repository of the workspace on screen, or, with that
	// shown alone already (or none on screen), all of them again.
	const viewedRepo = at.nav?.workspaces.find(({ id }) => id === at.viewed)?.repoId ?? null;
	if (at.focus)
		commands.push({
			id: 'focus:all',
			label: 'Show all repositories',
			group: sidebar,
			icon: 'icon-[lucide--folders]',
			shortcut: !viewedRepo || viewedRepo === at.focus ? 'focusRepo' : undefined,
			run: () => at.setFocus(null)
		});
	// Each repository the sidebar can show alone (those with workspaces), by name.
	const filterable = repos
		.filter((repo) => repo.workspaceCount > 0)
		.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	for (const repo of filterable)
		commands.push({
			id: `focus:${repo.id}`,
			label: repo.name,
			group: 'Repositories',
			icon: 'icon-[lucide--folder-git-2]',
			detail: repo.id === at.focus ? 'Shown alone' : undefined,
			keywords: 'repository show only filter',
			shortcut: repo.id === viewedRepo && repo.id !== at.focus ? 'focusRepo' : undefined,
			run: () => at.setFocus(repo.id)
		});

	commands.push({
		id: 'settings',
		label: 'Settings',
		group: 'Settings',
		icon: 'icon-[lucide--settings]',
		shortcut: 'settings',
		run: () => at.openSettings()
	});
	for (const section of at.sections)
		commands.push({
			id: `settings:${section.id}`,
			label: section.label,
			group: 'Settings',
			icon: section.icon,
			keywords: 'settings',
			run: () => at.openSettings(section.id)
		});

	const themes: [Theme, string, string][] = [
		['light', 'Light appearance', 'icon-[lucide--sun]'],
		['dark', 'Dark appearance', 'icon-[lucide--moon]'],
		['system', 'Appearance as the system', 'icon-[lucide--sun-moon]']
	];
	for (const [theme, label, icon] of themes)
		if (theme !== at.theme)
			commands.push({
				id: `theme:${theme}`,
				label,
				group: 'Appearance',
				icon,
				keywords: 'theme mode',
				run: () => at.setTheme(theme)
			});
	return commands;
}

/**
 * Where an item of the outline (a workspace's, say) can be moved (FDR-019): under any other
 * item, as its last, in the order the outline has them; and to the top. Not where it is
 * already, under itself, under a project, or under the record of an archived workspace.
 */
export function moveTargets(
	nav: Navigation | undefined,
	id: string | null,
	move: (parentId: string | null) => void
): Command[] {
	// todos are no place for a workspace: they are its supervisor's plan
	const items = withoutTodos(nav?.items ?? []);
	const byId = new Map(items.map((item) => [item.id, item]));
	const moved = id ? byId.get(id) : undefined;
	if (!moved) return [];
	const workspaces = new Map(nav?.workspaces.map((workspace) => [workspace.id, workspace]));
	const repoName = new Map(nav?.repos.map((repo) => [repo.id, repo.name]));
	const group = 'Move under';
	const top: Command = {
		id: 'move:top',
		label: 'The top of the outline',
		group,
		icon: 'icon-[lucide--list-tree]',
		run: () => move(null)
	};
	const under = nested(items).flatMap(({ workspace: item }): Command[] => {
		const above = lineOf(byId, item.parentId).reverse();
		const workspace = workspaces.get(item.id);
		if (item.id === moved.parentId || item.id === id || above.some((each) => each.id === id))
			return [];
		if (item.workspace && (!workspace || workspace.repoId === null)) return [];
		return [
			{
				id: `move:${item.id}`,
				label: item.text || 'Untitled',
				group,
				icon: item.workspace ? 'icon-[lucide--git-branch]' : 'icon-[lucide--folder]',
				// a workspace's sign is its repository's picture, as in the outline
				...(workspace?.repoId && {
					repo: { id: workspace.repoId, name: repoName.get(workspace.repoId) ?? '' }
				}),
				detail: above.map((each) => each.text || 'Untitled').join(' › ') || undefined,
				run: () => move(item.id)
			}
		];
	});
	return [...(moved.parentId === null ? [] : [top]), ...under];
}
