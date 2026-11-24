import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type { Worktree } from './worktree.ts';

/** How many paths one `paths` request may ask about. */
export const MAX_PATHS = 100;

/**
 * What a worktree-relative path names (`.` for the worktree itself): a file or a directory,
 * with where it is, or `null` if neither, or not really inside the worktree: no `..`, no
 * `.git`, no symlink.
 */
export function entryIn(
	worktree: Pick<Worktree, 'path'>,
	path: string
): { kind: 'file' | 'folder'; at: string } | null {
	const parts = path.split('/');
	if (isAbsolute(path) || parts.some((part) => part === '..' || part.toLowerCase() === '.git'))
		return null;
	try {
		const root = realpathSync(worktree.path);
		const at = join(root, path);
		if (realpathSync(at) !== at) return null;
		const stats = statSync(at);
		return stats.isDirectory()
			? { kind: 'folder', at }
			: stats.isFile()
				? { kind: 'file', at }
				: null;
	} catch {
		return null;
	}
}

/** The directory a worktree-relative path names, as `entryIn` finds it, or `null`. */
export function folderIn(worktree: Pick<Worktree, 'path'>, path: string): string | null {
	const entry = entryIn(worktree, path);
	return entry?.kind === 'folder' ? entry.at : null;
}

/** Which of these worktree-relative paths are files in the worktree, and which directories. */
export function sortPaths(worktree: Pick<Worktree, 'path'>, paths: string[]) {
	const found = { files: [] as string[], folders: [] as string[] };
	for (const path of paths.slice(0, MAX_PATHS)) {
		const kind = entryIn(worktree, path)?.kind;
		if (kind) found[kind === 'file' ? 'files' : 'folders'].push(path);
	}
	return found;
}

/**
 * Opens a directory in the file manager of the daemon's machine. On macOS a directory with
 * an extension may be a bundle (an app, say), which opening would launch: it is shown in
 * its folder instead.
 */
export function openFolder(folder: string) {
	const bundle = /.\.[^.]+$/.test(basename(folder));
	const [command, ...args] =
		process.platform === 'darwin'
			? ['open', ...(bundle ? ['-R'] : []), folder]
			: process.platform === 'win32'
				? ['explorer', folder]
				: ['xdg-open', folder];
	spawn(command, args, { detached: true, stdio: 'ignore' })
		.on('error', (error) => console.warn(`could not open ${folder}: ${error.message}`))
		.unref();
}
