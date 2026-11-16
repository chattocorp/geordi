/**
 * The window layout of a workspace: a tree of splits whose leaves are groups of tabs.
 * Tabs are opaque IDs; what a tab shows is up to the caller. All functions are pure and
 * return a new layout (or the same one, if nothing changed).
 */
export type Group = {
	kind: 'group';
	id: string;
	tabs: string[];
	active: string | null;
};
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

/** A group of tabs. Give it an `id` to find it again later. */
export const singleGroup = (tabs: string[], { id = uid() }: { id?: string } = {}): Group => ({
	kind: 'group',
	id,
	tabs,
	active: tabs[0] ?? null
});

const group = (tabs: string[]) => singleGroup(tabs);

/** Two layouts side by side (`row`) or one above the other (`column`); `ratio` is the first one's share. */
export const splitOf = (dir: Split['dir'], ratio: number, a: Layout, b: Layout): Split => ({
	kind: 'split',
	id: uid(),
	dir,
	ratio,
	a,
	b
});

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

/**
 * The group with `tab` in it: before the tab `before`, at the end (`null`), or where it is
 * already, else at the end (not said).
 */
function withTab(group: Group, tab: string, activate = true, before?: string | null): Group {
	let tabs = group.tabs;
	if (before !== undefined && before !== tab) {
		const others = tabs.filter((other) => other !== tab);
		const index = before === null ? -1 : others.indexOf(before);
		tabs = index < 0 ? [...others, tab] : [...others.slice(0, index), tab, ...others.slice(index)];
	} else if (!tabs.includes(tab)) tabs = [...tabs, tab];
	return { ...group, tabs, active: activate || !group.active ? tab : group.active };
}

/** Shows `tab`: activates it if it is open, else adds it to the given (or first) group. */
export function open(layout: Layout, tab: string, groupId?: string): Layout {
	const groups = groupsOf(layout);
	const target =
		groups.find((g) => g.tabs.includes(tab)) ?? groups.find((g) => g.id === groupId) ?? groups[0];
	return mapGroups(layout, (g) => (g === target ? withTab(g, tab) : g))!;
}

/**
 * Adds `tab` to the given (or first) group, unless it is open already, without bringing it
 * to the front.
 */
export function add(layout: Layout, tab: string, groupId?: string): Layout {
	const groups = groupsOf(layout);
	if (groups.some((g) => g.tabs.includes(tab))) return layout;
	const target = groups.find((g) => g.id === groupId) ?? groups[0];
	return mapGroups(layout, (g) => (g === target ? withTab(g, tab, false) : g))!;
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

/**
 * Puts a tab that is not in the layout yet into a group (`center`: before the tab `before`,
 * or at the end), or into a new group on one of its sides. Does nothing if there is no
 * such group.
 */
export function insert(
	layout: Layout,
	tab: string,
	groupId: string,
	zone: Zone,
	before?: string | null
): Layout {
	return mapGroups(layout, (g) => {
		if (g.id !== groupId) return g;
		if (zone === 'center') return withTab(g, tab, true, before);
		const fresh = group([tab]);
		const first = zone === 'left' || zone === 'top';
		return splitOf(
			zone === 'left' || zone === 'right' ? 'row' : 'column',
			0.5,
			first ? fresh : g,
			first ? g : fresh
		);
	})!;
}

/**
 * Moves a tab into another group (`center`), or into a new group on one of its sides. With
 * `before` (a tab, or `null` for the end) it goes to that place among the group's tabs,
 * also within its own group: that is how tabs are put in another order.
 */
export function move(
	layout: Layout,
	tab: string,
	groupId: string,
	zone: Zone,
	before?: string | null
): Layout {
	const source = groupsOf(layout).find((g) => g.tabs.includes(tab));
	if (!source) return layout;
	if (source.id === groupId) {
		if (zone === 'center') {
			if (before === undefined || before === tab) return layout;
			const placed = withTab(source, tab, true, before);
			// dropped where it is
			if (placed.tabs.every((other, index) => other === source.tabs[index])) return layout;
			return mapGroups(layout, (g) => (g === source ? placed : g))!;
		}
		// Splitting a group off its own only tab would change nothing.
		if (source.tabs.length === 1) return layout;
	}

	const removed = mapGroups(layout, (g) => (g === source ? without(g, tab) : g))!;
	return insert(removed, tab, groupId, zone, before);
}

/** All of a layout's tabs in one group, in their order: for where there is no splitting. */
export function flatten(layout: Layout, id: string): Group {
	if (layout.kind === 'group') return layout;
	const groups = groupsOf(layout);
	const tabs = groups.flatMap((g) => g.tabs);
	return { kind: 'group', id, tabs, active: groups[0]?.active ?? tabs[0] ?? null };
}

export function resize(layout: Layout, splitId: string, ratio: number): Layout {
	if (layout.kind === 'group') return layout;
	if (layout.id === splitId) return { ...layout, ratio };
	return { ...layout, a: resize(layout.a, splitId, ratio), b: resize(layout.b, splitId, ratio) };
}
