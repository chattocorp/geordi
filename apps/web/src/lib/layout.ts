/**
 * The window layout of a workspace: a tree of splits whose leaves are groups of tabs.
 * Tabs are opaque IDs; what a tab shows is up to the caller. All functions are pure and
 * return a new layout (or the same one, if nothing changed).
 */
export type Group = { kind: 'group'; id: string; tabs: string[]; active: string | null };
export type Split = {
	kind: 'split';
	id: string;
	dir: 'row' | 'column';
	/** The share of the space the first child gets, between 0 and 1. */
	ratio: number;
	a: Layout;
	b: Layout;
};
export type Layout = Group | Split;

/** Where a dragged tab lands in a group: among its tabs, or in a new group beside it. */
export type Zone = 'center' | 'left' | 'right' | 'top' | 'bottom';

const uid = () => Math.random().toString(36).slice(2, 10);

const group = (tabs: string[]): Group => ({
	kind: 'group',
	id: uid(),
	tabs,
	active: tabs[0] ?? null
});

/** Everything in one group. */
export const singleGroup = group;

export function groupsOf(layout: Layout): Group[] {
	return layout.kind === 'group' ? [layout] : [...groupsOf(layout.a), ...groupsOf(layout.b)];
}

export const tabsOf = (layout: Layout): string[] => groupsOf(layout).flatMap((g) => g.tabs);

/**
 * Rebuilds the layout with each group replaced by `fn`'s result. A group replaced by
 * `null` disappears, and the split it was in collapses into its other half.
 */
function mapGroups(layout: Layout, fn: (group: Group) => Layout | null): Layout | null {
	if (layout.kind === 'group') return fn(layout);
	const a = mapGroups(layout.a, fn);
	const b = mapGroups(layout.b, fn);
	if (!a || !b) return a ?? b;
	return a === layout.a && b === layout.b ? layout : { ...layout, a, b };
}

function without(group: Group, tab: string): Group | null {
	const index = group.tabs.indexOf(tab);
	const tabs = group.tabs.filter((other) => other !== tab);
	if (tabs.length === 0) return null;
	const active = group.active === tab ? tabs[Math.min(index, tabs.length - 1)] : group.active;
	return { ...group, tabs, active };
}

const withTab = (group: Group, tab: string, activate = true): Group => ({
	...group,
	tabs: group.tabs.includes(tab) ? group.tabs : [...group.tabs, tab],
	active: activate || !group.active ? tab : group.active
});

/** Shows `tab`: activates it if it is open, else adds it to the given (or first) group. */
export function open(layout: Layout, tab: string, groupId?: string): Layout {
	const groups = groupsOf(layout);
	const target =
		groups.find((g) => g.tabs.includes(tab)) ?? groups.find((g) => g.id === groupId) ?? groups[0];
	return mapGroups(layout, (g) => (g === target ? withTab(g, tab) : g))!;
}

/** Adds `tab` to the first group, unless it is open already, without bringing it to the front. */
export function add(layout: Layout, tab: string): Layout {
	const [first, ...others] = groupsOf(layout);
	if ([first, ...others].some((g) => g.tabs.includes(tab))) return layout;
	return mapGroups(layout, (g) => (g === first ? withTab(g, tab, false) : g))!;
}

export function close(layout: Layout, tab: string): Layout {
	return mapGroups(layout, (g) => (g.tabs.includes(tab) ? without(g, tab) : g)) ?? singleGroup([]);
}

/** Closes every tab `keep` rejects. */
export function prune(layout: Layout, keep: (tab: string) => boolean): Layout {
	return tabsOf(layout)
		.filter((tab) => !keep(tab))
		.reduce(close, layout);
}

/** Swaps one tab for another, in place. */
export function replace(layout: Layout, tab: string, next: string): Layout {
	return mapGroups(layout, (g) =>
		g.tabs.includes(tab)
			? {
					...g,
					tabs: g.tabs.map((other) => (other === tab ? next : other)),
					active: g.active === tab ? next : g.active
				}
			: g
	)!;
}

/** Moves a tab into another group (`center`), or into a new group on one of its sides. */
export function move(layout: Layout, tab: string, groupId: string, zone: Zone): Layout {
	const source = groupsOf(layout).find((g) => g.tabs.includes(tab));
	if (!source) return layout;
	// Splitting a group off its own only tab would change nothing.
	if (source.id === groupId && (zone === 'center' || source.tabs.length === 1)) return layout;

	const removed = mapGroups(layout, (g) => (g === source ? without(g, tab) : g))!;
	return mapGroups(removed, (g) => {
		if (g.id !== groupId) return g;
		if (zone === 'center') return withTab(g, tab);
		const fresh = group([tab]);
		const first = zone === 'left' || zone === 'top';
		return {
			kind: 'split',
			id: uid(),
			dir: zone === 'left' || zone === 'right' ? 'row' : 'column',
			ratio: 0.5,
			a: first ? fresh : g,
			b: first ? g : fresh
		};
	})!;
}

export function resize(layout: Layout, splitId: string, ratio: number): Layout {
	if (layout.kind === 'group') return layout;
	if (layout.id === splitId) return { ...layout, ratio };
	return { ...layout, a: resize(layout.a, splitId, ratio), b: resize(layout.b, splitId, ratio) };
}
