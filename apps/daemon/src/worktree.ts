import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

const read = (file: string) => readFileSync(file, 'utf8').trim();
const same = (a: string, b: string) => realpathSync(a) === realpathSync(b);

/**
 * Checks that the worktree, its admin directory and the repository's .git still point at
 * each other. The agent can write all three links, and whoever runs git in the worktree
 * afterwards trusts them: repointing one at a directory with its own git config or hooks
 * would run the agent's code outside its sandbox.
 */
function verifyLinks(path: string, adminDir: string, commonDir: string) {
	try {
		const intact =
			same(resolve(adminDir, read(join(adminDir, 'commondir'))), commonDir) &&
			same(read(join(adminDir, 'gitdir')), join(path, '.git')) &&
			same(read(join(path, '.git')).replace(/^gitdir: /, ''), adminDir);
		if (intact) return;
	} catch {
		// a missing or unreadable link is as bad as a wrong one
	}
	throw new Error(`The Git metadata of worktree ${path} was modified; refusing to use it`);
}

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

	// Never ask git inside the worktree (its metadata is agent-writable): derive the admin
	// directory from the repository, where git names it after the worktree's directory.
	const commonDir = resolve(repoPath, git(repoPath, 'rev-parse', '--git-common-dir'));
	const adminDir = join(commonDir, 'worktrees', short);
	verifyLinks(path, adminDir, commonDir);

	// What a commit writes outside the worktree: objects, refs and reflogs in the shared
	// .git, plus the worktree's own admin directory (HEAD, index and their lock files, which
	// is why the whole directory must be writable). Not hooks/ or config.
	const writableRoots = ['objects', 'refs', 'logs'].map((dir) => join(commonDir, dir));
	for (const dir of writableRoots) mkdirSync(dir, { recursive: true });
	writableRoots.push(adminDir);

	return { path, branch, writableRoots, created };
}
