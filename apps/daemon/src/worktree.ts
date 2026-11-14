import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

/**
 * Ensures the session's worktree exists, creating it (on a new branch off the repository's
 * current HEAD) on first use. Paths are derived from the session ID, so this is idempotent.
 */
export function ensureWorktree(baseDir: string, repoPath: string, sessionId: string) {
	const short = sessionId.slice(0, 8);
	const path = join(baseDir, basename(repoPath), short);
	const branch = `geordi/${short}`;

	const created = !existsSync(path);
	if (created) {
		mkdirSync(join(baseDir, basename(repoPath)), { recursive: true });
		git(repoPath, 'worktree', 'add', '-b', branch, path, 'HEAD');
	}

	// What a commit writes outside the worktree: objects, refs and reflogs in the shared
	// .git, plus the worktree's own admin directory (HEAD, index). Not hooks/ or config.
	const commonDir = resolve(repoPath, git(repoPath, 'rev-parse', '--git-common-dir'));
	const adminDir = resolve(path, git(path, 'rev-parse', '--git-dir'));
	const writableRoots = ['objects', 'refs', 'logs'].map((dir) => join(commonDir, dir));
	for (const dir of writableRoots) mkdirSync(dir, { recursive: true });
	writableRoots.push(adminDir);

	return { path, branch, writableRoots, created };
}
