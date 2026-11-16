import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoIcon } from '@geordi/protocol';

/**
 * A picture that stands for a repository, as the repository itself has one: the favicon of
 * the app in it, or a logo. Found among its tracked files, by name; the best name wins,
 * then the file nearest the top.
 */

/** What such a picture is called, the likeliest first, and what it is served as. */
const NAMES: [name: string, type: string][] = [
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

/** The file to use among these paths, if any of them will do. */
export function pickIcon(paths: string[]): { path: string; type: string } | null {
	const ranked = paths
		.filter((path) => !ELSEWHERE.test(path))
		.flatMap((path) => {
			const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
			const rank = NAMES.findIndex(([name]) => name === base);
			return rank < 0 ? [] : [{ path, type: NAMES[rank][1], rank, depth: path.split('/').length }];
		})
		.sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.path.localeCompare(b.path));
	const [best] = ranked;
	return best ? { path: best.path, type: best.type } : null;
}

export function repoIcon(repoPath: string): RepoIcon | null {
	let listed: string;
	try {
		listed = execFileSync(
			'git',
			['-C', repoPath, 'ls-files', '-z', '--', ...NAMES.map(([name]) => `:(glob,icase)**/${name}`)],
			{ encoding: 'utf8', timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }
		);
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
