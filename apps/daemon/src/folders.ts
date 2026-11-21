import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type { Worktree } from './worktree.ts';

/** How many paths one `folders` request may ask about. */
export const MAX_FOLDERS = 100;

/**
 * The directory a worktree-relative path names (`.` for the worktree itself), or `null` if
 * it is not one, or not really inside the worktree: no `..`, no `.git`, no symlink.
 */
export function folderIn(worktree: Worktree, path: string): string | null {
	const parts = path.split('/');
	if (isAbsolute(path) || parts.some((part) => part === '..' || part.toLowerCase() === '.git'))
		return null;
	try {
		const root = realpathSync(worktree.path);
		const folder = join(root, path);
		if (realpathSync(folder) !== folder) return null;
		return statSync(folder).isDirectory() ? folder : null;
	} catch {
		return null;
	}
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
