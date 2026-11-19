import { groupsOf, prune, type Layout } from '#lib/layout.ts';

export type Area = 'main' | 'side' | 'dock';
export type Arrangement = Partial<Record<Area, Layout | null>> & { diffPath?: string };

const legacyDiff = (tab: string) => tab.startsWith('diff:');

/** Restore older per-file tabs as one diff tab, preferring a file that was visible. */
export function restoreDiff(saved: Arrangement): Arrangement {
	if (saved.diffPath) return saved;
	const areas = ['main', 'side', 'dock'] as const;
	const groups = areas.flatMap((area) => (saved[area] ? groupsOf(saved[area]) : []));
	const tab =
		groups.find((group) => group.active && legacyDiff(group.active))?.active ??
		groups.flatMap((group) => group.tabs).find(legacyDiff);
	if (!tab) return saved;

	function rename(layout: Layout): Layout {
		if (layout.kind === 'split') return { ...layout, a: rename(layout.a), b: rename(layout.b) };
		return {
			...layout,
			tabs: layout.tabs.map((id) => (id === tab ? 'diff' : id)),
			active: layout.active === tab ? 'diff' : layout.active
		};
	}

	const restored = { ...saved, diffPath: tab.slice(5) };
	for (const area of areas) {
		const layout = saved[area];
		if (layout) restored[area] = rename(prune(layout, (id) => !legacyDiff(id) || id === tab));
	}
	return restored;
}
