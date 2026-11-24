import type { RepoSection } from '@geordi/protocol';

/** Files of one of the repository's sections; `path` is `null` for those in none. */
export type Section<F> = { path: string | null; title: string; icon?: string; files: F[] };

const inside = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);

/**
 * Files grouped by the repository's sections they are in, in the sections' order, and last
 * the files in none. Each file goes to the section with the longest path that holds it, so
 * a section may lie within another. Sections without files are left out.
 */
export function bySection<F extends { path: string }>(
	files: readonly F[],
	sections: readonly RepoSection[]
): Section<F>[] {
	const all: Section<F>[] = [
		...sections.map(({ path, title, icon }) => ({ path, title, icon, files: [] as F[] })),
		{ path: null, title: 'Other', files: [] }
	];
	for (const file of files) {
		let home = all[all.length - 1];
		for (const section of all)
			if (
				section.path !== null &&
				inside(file.path, section.path) &&
				(home.path === null || section.path.length > home.path.length)
			)
				home = section;
		home.files.push(file);
	}
	return all.filter((section) => section.files.length > 0);
}
