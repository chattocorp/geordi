import { git } from './git.ts';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoIcon, RepoSection } from '@geordi/protocol';
import { gitIn, type Worktree } from './worktree.ts';

/**
 * A picture that stands for a repository, as the repository itself has one: the favicon of
 * the app in it, or a logo. Found among its tracked files, by name; the file nearest the root wins,
 * then the best name. A `.geordi.svg` (or `.png`, `.ico`) is one put there for Geordi, as the
 * picture of the directory it is in: it counts only there, and there it is the best.
 */

/** What such a picture is called, the likeliest first, and what it is served as. */
const NAMES: [name: string, type: string][] = [
	['.geordi.svg', 'image/svg+xml'],
	['.geordi.png', 'image/png'],
	['.geordi.ico', 'image/x-icon'],
	['favicon.svg', 'image/svg+xml'],
	['favicon.png', 'image/png'],
	['icon.svg', 'image/svg+xml'],
	['logo.svg', 'image/svg+xml'],
	['favicon.ico', 'image/x-icon'],
	['apple-touch-icon.png', 'image/png'],
	['icon.png', 'image/png'],
	['logo.png', 'image/png']
];
/** A picture for the sidebar is small. Anything bigger is something else. */
const MAX_BYTES = 256 * 1024;
/** Not where a project keeps the picture of itself. */
const ELSEWHERE = /(^|\/)(node_modules|vendor|fixtures?|examples?|tests?|__tests__|e2e)\//i;

/** One put there for Geordi: it stands for the directory it is in, not for those above. */
const FOR_GEORDI = /^\.geordi\./i;

/** The file to use among these paths (from the directory it is to stand for), if any will do. */
export function pickIcon(paths: string[]): { path: string; type: string } | null {
	const ranked = paths
		.filter((path) => !ELSEWHERE.test(path))
		.filter(
			(path) => !path.includes('/') || !FOR_GEORDI.test(path.slice(path.lastIndexOf('/') + 1))
		)
		.flatMap((path) => {
			const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
			const rank = NAMES.findIndex(([name]) => name === base);
			return rank < 0 ? [] : [{ path, type: NAMES[rank][1], rank, depth: path.split('/').length }];
		})
		.sort((a, b) => a.depth - b.depth || a.rank - b.rank || a.path.localeCompare(b.path));
	const [best] = ranked;
	return best ? { path: best.path, type: best.type } : null;
}

export async function repoIcon(repoPath: string): Promise<RepoIcon | null> {
	let listed: string;
	try {
		listed = await git(repoPath, [
			'ls-files',
			'-z',
			'--',
			...NAMES.map(([name]) => `:(glob,icase)**/${name}`)
		]);
	} catch {
		return null;
	}
	const found = pickIcon(listed.split('\0').filter(Boolean));
	if (!found) return null;
	try {
		// the file itself, not what a link in its place points to
		const file = openSync(join(repoPath, found.path), constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const { size } = fstatSync(file);
			if (!fstatSync(file).isFile() || size === 0 || size > MAX_BYTES) return null;
			return { type: found.type, data: readFileSync(file).toString('base64') };
		} finally {
			closeSync(file);
		}
	} catch {
		return null;
	}
}

/**
 * The repository's sections (FDR-006), each with its picture: the one the file names, else
 * the one nearest the section's own directory among its tracked files, found as a
 * repository's is. Not an `.ico`: a section's picture is shown as a picture of the
 * worktree's, which is a PNG, JPEG, WebP, GIF or SVG.
 */
export async function withIcons(
	worktree: Worktree,
	sections: RepoSection[]
): Promise<RepoSection[]> {
	const looking = sections.filter((section) => section.icon === undefined);
	if (looking.length === 0) return sections;
	let listed: string[];
	try {
		const out = await gitIn(worktree, 'ls-files', '-z', '--', ...looking.map(({ path }) => path));
		listed = out.split('\0').filter((path) => path && !path.toLowerCase().endsWith('.ico'));
	} catch {
		return sections;
	}
	return sections.map((section) => {
		if (section.icon !== undefined) return section;
		const prefix = `${section.path}/`;
		const found = pickIcon(
			listed.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
		);
		return found ? { ...section, icon: prefix + found.path } : section;
	});
}
