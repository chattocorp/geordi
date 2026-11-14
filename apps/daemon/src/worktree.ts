import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

const read = (file: string) => readFileSync(file, 'utf8').trim();
const same = (a: string, b: string) => realpathSync(a) === realpathSync(b);

export type Worktree = {
	path: string;
	branch: string;
	/** The worktree's own directory inside the repository's .git (HEAD, index). */
	adminDir: string;
	/** The repository's shared .git directory. */
	commonDir: string;
};

/**
 * Checks that the worktree, its admin directory and the repository's .git still point at
 * each other. The agent can write all three links, and whoever runs git in the worktree
 * afterwards trusts them: repointing one at a directory with its own git config or hooks
 * would run the agent's code outside its sandbox.
 */
export function verifyLinks({ path, adminDir, commonDir }: Worktree) {
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
 * Where a workspace's worktree lives. Everything is derived from the repository and the
 * workspace ID, never by asking git inside the worktree (its metadata is agent-writable).
 */
function describe(baseDir: string, repoPath: string, workspaceId: string): Worktree {
	const short = workspaceId.slice(0, 8);
	const commonDir = resolve(repoPath, git(repoPath, 'rev-parse', '--git-common-dir'));
	return {
		path: join(baseDir, basename(repoPath), short),
		branch: `geordi/${short}`,
		// git names the admin directory after the worktree's directory
		adminDir: join(commonDir, 'worktrees', short),
		commonDir
	};
}

/** The workspace's existing worktree. Throws if there is none yet, or it was tampered with. */
export function locateWorktree(baseDir: string, repoPath: string, workspaceId: string): Worktree {
	const worktree = describe(baseDir, repoPath, workspaceId);
	if (!existsSync(worktree.path)) throw new Error('This workspace has no worktree yet');
	verifyLinks(worktree);
	return worktree;
}

/**
 * Ensures the workspace's worktree exists, creating it (on a new branch off the repository's
 * current HEAD) on first use. Paths are derived from the workspace ID, so this is idempotent.
 */
export function ensureWorktree(baseDir: string, repoPath: string, workspaceId: string) {
	const worktree = describe(baseDir, repoPath, workspaceId);

	const created = !existsSync(worktree.path);
	if (created) {
		mkdirSync(join(baseDir, basename(repoPath)), { recursive: true });
		git(repoPath, 'worktree', 'add', '-b', worktree.branch, worktree.path, 'HEAD');
	}
	verifyLinks(worktree);

	// What a commit writes outside the worktree: objects, refs and reflogs in the shared
	// .git, plus the worktree's own admin directory (HEAD, index and their lock files, which
	// is why the whole directory must be writable). Not hooks/ or config.
	const writableRoots = ['objects', 'refs', 'logs'].map((dir) => join(worktree.commonDir, dir));
	for (const dir of writableRoots) mkdirSync(dir, { recursive: true });
	writableRoots.push(worktree.adminDir);

	return { ...worktree, writableRoots, created };
}

/**
 * What the worktree has checked out, as a revision: a branch ref or a commit ID. Read from
 * the admin directory's HEAD by hand, because `gitIn` deliberately doesn't use that directory.
 */
export function headOf({ path, adminDir }: Worktree): string {
	const head = read(join(adminDir, 'HEAD'));
	const match = /^ref: (refs\/heads\/[\w./-]+)$/.exec(head) ?? /^([0-9a-f]{40,64})$/.exec(head);
	if (!match) throw new Error(`Worktree ${path} has an unreadable HEAD`);
	return match[1];
}

/**
 * Runs git on a worktree's files without trusting anything an agent can write. Git uses the
 * repository's own .git directory (so only its config, hooks and filters apply, never the
 * worktree's `config.worktree` or repointed links), the worktree's files, and the worktree's
 * index. `HEAD` therefore means the repository's HEAD here: use `headOf` for the worktree's.
 */
export function gitIn({ path, adminDir, commonDir }: Worktree, ...args: string[]): string {
	return execFileSync('git', ['--literal-pathspecs', ...args], {
		cwd: path,
		env: {
			...process.env,
			GIT_DIR: commonDir,
			GIT_WORK_TREE: path,
			GIT_INDEX_FILE: join(adminDir, 'index')
		},
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
}
