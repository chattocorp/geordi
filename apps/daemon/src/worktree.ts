import { CHECKOUT_TIMEOUT, git, quietGit } from './git.ts';
import { BRANCH_NAME, NO_WORKTREE, type PullRequest, type WorktreeRef } from '@geordi/protocol';
import { devNull } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
	closeSync,
	constants,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	writeFileSync,
	writeSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

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

export const worktreePath = (
	baseDir: string,
	{ repoPath, worktreeId, worktreeParent }: WorktreeRef
) => join(baseDir, worktreeParent ?? basename(repoPath), worktreeId.slice(0, 8));

// Cache the usual checkout only. A linked checkout has a .git file that can be repointed.
const ordinaryRepos = new Set<string>();

async function commonDirOf(repoPath: string) {
	const dotGit = resolve(repoPath, '.git');
	if (
		ordinaryRepos.has(repoPath) &&
		lstatSync(dotGit, { throwIfNoEntry: false })?.isDirectory() &&
		!existsSync(join(dotGit, 'commondir'))
	)
		return dotGit;
	const dir = resolve(repoPath, (await git(repoPath, ['rev-parse', '--git-common-dir'])).trim());
	if (dir === dotGit) ordinaryRepos.add(repoPath);
	else ordinaryRepos.delete(repoPath);
	return dir;
}

/**
 * Where a workspace's worktree lives. Everything is derived from the repository and the
 * workspace ID, never by asking git inside the worktree (its metadata is agent-writable).
 */
export async function describe(baseDir: string, ref: WorktreeRef): Promise<Worktree> {
	const short = ref.worktreeId.slice(0, 8);
	const commonDir = await commonDirOf(ref.repoPath);
	return {
		path: worktreePath(baseDir, ref),
		branch: `geordi/${short}`,
		// git names the admin directory after the worktree's directory
		adminDir: join(commonDir, 'worktrees', short),
		commonDir
	};
}

/** A branch name as an unambiguous revision. Rejects anything git could read as an option. */
export function branchRef(branch: string): string {
	if (!BRANCH_NAME.test(branch)) throw new Error(`Not a branch name: ${branch}`);
	return `refs/heads/${branch}`;
}

/** The workspace's existing worktree. Throws if there is none yet, or it was tampered with. */
/** Whether the workspace's worktree is there already. */
export const hasWorktree = (baseDir: string, ref: WorktreeRef) =>
	existsSync(worktreePath(baseDir, ref));

export async function locateWorktree(baseDir: string, ref: WorktreeRef): Promise<Worktree> {
	const worktree = await describe(baseDir, ref);
	if (!existsSync(worktree.path)) throw new Error(NO_WORKTREE);
	verifyLinks(worktree);
	return worktree;
}

/**
 * Where work in a repository starts from, as a revision: the branch its upstream calls its
 * main one (`origin/main`, say), as far as this machine knows it. Work is meant to end up
 * there, so that is where it should branch off, whatever the repository's own checkout
 * happens to be on. `HEAD` for a repository without an upstream.
 */
export async function startOf(repoPath: string): Promise<string> {
	const upstream = await quietGit(repoPath, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD');
	return upstream && (await quietGit(repoPath, 'rev-parse', '--verify', '--quiet', upstream))
		? upstream
		: 'HEAD';
}

/**
 * A branch named as a base, as a full ref: the upstream's (`origin/main`, never a local `main`
 * that has moved on or fallen behind), as far as this machine knows it. Only a branch the
 * upstream doesn't have is the local one: an agent's, not pushed yet, to build on. `null` if
 * there is neither.
 */
export async function branchOn(repoPath: string, branch: string): Promise<string | null> {
	const exists = async (ref: string) =>
		(await quietGit(repoPath, 'rev-parse', '--verify', '--quiet', ref)) !== null;
	const local = branchRef(branch);
	const remote = local.replace('refs/heads/', 'refs/remotes/origin/');
	if (await exists(remote)) return remote;
	return (await exists(local)) ? local : null;
}

/**
 * The branches work in a repository may start from, by name, the most recently committed to
 * first: its upstream's, where it has one (work is meant to end up there), else its own.
 * `start` is the one work starts from when none is named (see `startOf`), `null` in a
 * repository on no branch at all.
 */
export async function branchesOf(
	repoPath: string
): Promise<{ start: string | null; branches: string[] }> {
	const start = await startOf(repoPath);
	const startName =
		start === 'HEAD'
			? ((await quietGit(repoPath, 'symbolic-ref', '--quiet', '--short', 'HEAD')) ?? null)
			: start.replace(/^refs\/remotes\/origin\//, '');
	const upstream = (await quietGit(repoPath, 'remote', 'get-url', 'origin')) !== null;
	const refs = await git(repoPath, [
		'for-each-ref',
		'--sort=-committerdate',
		'--format=%(refname)',
		upstream ? 'refs/remotes/origin/' : 'refs/heads/'
	]);
	const names = new Set<string>();
	for (const ref of refs.split('\n')) {
		const name = /^refs\/(?:heads|remotes\/origin)\/(.+)$/.exec(ref.trim())?.[1];
		if (name && name !== 'HEAD' && BRANCH_NAME.test(name)) names.add(name);
	}
	if (startName) names.add(startName);
	return { start: startName, branches: [...names] };
}

/**
 * The name a branch goes by on the upstream. Its own, as a rule; but whoever pushed it may
 * have given it another one there (`git push -u origin HEAD:a-better-name`, which agents
 * like to do), and Git remembers that. Then that is where its pushed commits and its pull
 * request are.
 */
export async function upstreamBranchOf(repoPath: string, branch: string): Promise<string> {
	const config = (key: string) => quietGit(repoPath, 'config', '--get', `branch.${branch}.${key}`);
	const name = /^refs\/heads\/(.+)$/.exec((await config('merge')) ?? '')?.[1];
	if ((await config('remote')) !== 'origin' || !name || !BRANCH_NAME.test(name)) return branch;
	// set to follow the main branch, it has not been pushed there: it has no place upstream yet
	return `refs/remotes/origin/${name}` === (await startOf(repoPath)) ? branch : name;
}

/** How long fetching may take before a workspace starts from what is already known. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Brings what this machine knows of the repository's upstream up to date, so that new work
 * starts from where things stand now. Never in the way: without an upstream, without a
 * network or without credentials, the workspace starts from what is known. Resolves to why
 * it didn't work, if it didn't.
 */
export async function fetchUpstream(repoPath: string): Promise<string | null> {
	if ((await quietGit(repoPath, 'remote', 'get-url', 'origin')) === null) return null;
	const env = { GIT_SSH_COMMAND: 'ssh -oBatchMode=yes', ...process.env, GIT_TERMINAL_PROMPT: '0' };
	try {
		await git(repoPath, ['fetch', '--quiet', 'origin'], { timeout: FETCH_TIMEOUT_MS, env });
		if ((await startOf(repoPath)) === 'HEAD')
			await git(repoPath, ['remote', 'set-head', 'origin', '--auto'], {
				timeout: FETCH_TIMEOUT_MS,
				env
			}).catch(() => {});
		return null;
	} catch (error) {
		return (error as { stderr?: string }).stderr?.trim() || (error as Error).message;
	}
}

/** Keep the archived tip under the worktree ID so Restore also survives a lost archive reply. */
export const archivedBranches = 'refs/geordi/archived/';

/** Capture the checked-out ref before releasing the worktree. A linked HEAD is untrusted. */
export async function branchBeforeCleanup(repoPath: string, worktree: Worktree) {
	if (!lstatSync(join(worktree.adminDir, 'HEAD')).isFile()) return null;
	const branch = branchOf(worktree);
	if (!branch) return null;
	const tip = await quietGit(repoPath, 'rev-parse', '--verify', branchRef(branch));
	return tip ? { branch, tip } : null;
}

export async function cleanMergedBranch(
	repoPath: string,
	previous: { branch: string; tip: string } | null,
	{ base, pull, archiveId }: { base?: string; pull?: PullRequest | null; archiveId?: string }
) {
	if (!previous) return;
	const { branch, tip } = previous;
	// Cleanup is best effort. Unknown ancestry or a concurrent ref change leaves the branch.
	try {
		const ref = branchRef(branch);
		const start = await startOf(repoPath);
		const target = pull?.base
			? 'refs/remotes/origin/' + branchRef(pull.base).slice('refs/heads/'.length)
			: base
				? await branchOn(repoPath, base)
				: start;
		if (
			!target ||
			branch === base ||
			branch === pull?.base ||
			start === `refs/remotes/origin/${branch}`
		)
			return;
		const targetRef = (await git(repoPath, ['rev-parse', '--symbolic-full-name', target])).trim();
		if (!targetRef.startsWith('refs/') || ref === targetRef) return;
		const merged = (await git(repoPath, ['rev-parse', '--verify', targetRef])).trim();
		if (pull?.state !== 'merged' || pull.mergedHead !== tip)
			await git(repoPath, ['--no-replace-objects', 'merge-base', '--is-ancestor', tip, merged]);
		const info = await git(repoPath, [
			'for-each-ref',
			'--format=%(refname)%09%(worktreepath)%09%(symref)',
			ref
		]);
		if (!info.split('\n').includes(ref + '\t\t')) return;
		const commands = [`verify ${targetRef} ${merged}`, `delete ${ref} ${tip}`];
		if (archiveId && !/^[a-zA-Z0-9-]+$/.test(archiveId)) return;
		if (archiveId) commands.push(`create ${archivedBranches}${archiveId}/${branch} ${tip}`);
		await git(
			repoPath,
			['-c', 'core.hooksPath=' + devNull, 'update-ref', '--no-deref', '--stdin'],
			{
				input: commands.join('\n') + '\n'
			}
		);
		await quietGit(repoPath, 'config', '--local', '--remove-section', 'branch.' + branch);
	} catch {
		// The worktree has already been removed or switched. It is safe to leave the branch.
	}
}

/**
 * Ensures the workspace's worktree exists, creating it on first use: on a new branch off
 * `base` (a branch name), or off where work in the repository starts (`startOf`). Paths are
 * derived from the workspace ID, so this is idempotent. A worktree that went missing is
 * brought back from its branch (`restored`).
 */
export async function ensureWorktree(baseDir: string, ref: WorktreeRef, requireBranch = false) {
	const { repoPath, base, branch } = ref;
	const described = await describe(baseDir, ref);
	const missing = !existsSync(described.path);
	const prefix = archivedBranches + ref.worktreeId + '/';
	const archived = missing
		? (await git(repoPath, ['for-each-ref', '--count=1', '--format=%(refname)', prefix])).trim()
		: '';
	const name = archived.startsWith(prefix) ? archived.slice(prefix.length) : branch;
	const worktree = name && branchRef(name) ? { ...described, branch: name } : described;
	// A branch without its worktree: the worktree was removed behind our back (or the
	// workspace archived and brought back). The branch has all that was committed, so the
	// worktree comes back from it; what wasn't committed is gone with the directory.
	const localTip = missing
		? await quietGit(repoPath, 'rev-parse', '--verify', '--quiet', branchRef(worktree.branch))
		: null;
	const restored = localTip !== null;
	if (archived && localTip && localTip !== (await git(repoPath, ['rev-parse', archived])).trim())
		throw new Error(`The local branch ${worktree.branch} now points to a different commit.`);
	if (missing && requireBranch && !restored && !archived)
		throw new Error(`The local branch ${worktree.branch} is missing.`);
	if (missing) {
		mkdirSync(dirname(worktree.path), { recursive: true });
		// git still lists a worktree whose directory is gone, and won't add it again until told
		await git(repoPath, ['worktree', 'prune']);
		if (restored)
			await git(repoPath, ['worktree', 'add', worktree.path, worktree.branch], {
				timeout: CHECKOUT_TIMEOUT
			});
		else {
			const start = archived || (base ? await branchOn(repoPath, base) : await startOf(repoPath));
			if (!start) throw new Error(`There is no branch ${base} to start from.`);
			// `--no-track`: the new branch is its own, not a local name for the upstream's main
			// one (which is where a plain `git push` would otherwise try to send it)
			await git(
				repoPath,
				['worktree', 'add', '--no-track', '-b', worktree.branch, worktree.path, start],
				{ timeout: CHECKOUT_TIMEOUT }
			);
		}
	}
	if (archived) await git(repoPath, ['update-ref', '--no-deref', '-d', archived]);
	const created = missing && !restored && !archived;
	verifyLinks(worktree);
	ensureContext(worktree.path);

	// What a commit writes outside the worktree: objects, refs and reflogs in the shared
	// .git, plus the worktree's own admin directory (HEAD, index and their lock files, which
	// is why the whole directory must be writable). Not hooks/ or config.
	const writableRoots = ['objects', 'refs', 'logs'].map((dir) => join(worktree.commonDir, dir));
	for (const dir of writableRoots) mkdirSync(dir, { recursive: true });
	writableRoots.push(worktree.adminDir);

	return { ...worktree, writableRoots, created, restored: restored || !!archived };
}

/** The agent's scratch folder in a worktree, for notes and temporary files. */
export const CONTEXT_DIR = '.context';

/**
 * Makes the worktree's scratch folder, ignored by Git through a `.gitignore` of its own
 * (`*` ignores the folder too), so that no shared ignore file needs touching. Left alone
 * if it is there already, whatever it is: the agent may have made it, or removed the file.
 */
function ensureContext(path: string) {
	const dir = join(path, CONTEXT_DIR);
	if (lexists(dir)) return;
	mkdirSync(dir);
	writeFileSync(join(dir, '.gitignore'), '*\n', { flag: 'wx' });
}

const lexists = (path: string) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;

/**
 * Moves a worktree to a new branch off where work in the repository starts (`startOf`):
 * for carrying on in a workspace whose work has landed. Returns the new branch.
 *
 * Without running git inside the worktree, whose own Git metadata is the agent's to write:
 * the branch is made in the repository, the worktree's files and index are set to it from
 * outside, and its HEAD is pointed there by hand. Uncommitted changes come along (work
 * begun after the old branch landed belongs to the new one); where they are to files that
 * differ between the two branches, nothing is moved and this throws.
 */
export async function continueOn(
	worktree: Worktree,
	repoPath: string,
	requireIdle = () => {},
	base?: string,
	pull?: PullRequest | null
): Promise<string> {
	verifyLinks(worktree);
	const previous = await branchBeforeCleanup(repoPath, worktree);
	// named after the worktree, like its first branch, and numbered
	const stem = `geordi/${basename(worktree.path)}`;
	let branch = '';
	for (let n = 2; !branch; n++) {
		const name = `${stem}-${n}`;
		if ((await quietGit(repoPath, 'rev-parse', '--verify', '--quiet', branchRef(name))) === null)
			branch = name;
	}

	const start = await startOf(repoPath);
	requireIdle();
	await git(repoPath, ['branch', '--no-track', branch, start]);
	try {
		requireIdle();
		await gitIn(worktree, 'read-tree', '-m', '-u', headOf(worktree), branchRef(branch));
	} catch (error) {
		await git(repoPath, ['branch', '-D', branch]); // nothing is on it yet
		throw error;
	}
	// The worktree's admin directory is the agent's to write: a HEAD turned into a link
	// would have us write wherever it points. So the new HEAD is a new file (which fails
	// rather than follow anything already there), moved into the old one's place (which
	// replaces a link rather than follow it).
	const head = join(worktree.adminDir, 'HEAD');
	const fresh = `${head}.${randomUUID()}`;
	const fd = openSync(
		fresh,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
		0o644
	);
	try {
		writeSync(fd, `ref: ${branchRef(branch)}\n`);
	} finally {
		closeSync(fd);
	}
	renameSync(fresh, head);
	await cleanMergedBranch(repoPath, previous, { base, pull });
	return branch;
}

/**
 * What the worktree has checked out, as a revision: a branch ref or a commit ID. Read from
 * the admin directory's HEAD by hand, because `gitIn` deliberately doesn't use that directory.
 */
export function headOf({ path, adminDir }: Worktree): string {
	const head = read(join(adminDir, 'HEAD'));
	const branch = /^ref: refs\/heads\/(.+)$/.exec(head)?.[1];
	if (branch && BRANCH_NAME.test(branch)) return `refs/heads/${branch}`;
	const commit = /^([0-9a-f]{40,64})$/.exec(head)?.[1];
	if (!commit) throw new Error(`Worktree ${path} has an unreadable HEAD`);
	return commit;
}

/** The branch a worktree is on, by name; `null` for a detached HEAD. */
export function branchOf(worktree: Worktree): string | null {
	const head = headOf(worktree);
	return head.startsWith('refs/heads/') ? head.slice('refs/heads/'.length) : null;
}

/**
 * The environment in which git, run by us or by a tool we run, looks at a worktree's files
 * without trusting the worktree's own Git metadata (see `gitIn`).
 */
export const gitEnv = ({ path, adminDir, commonDir }: Worktree): NodeJS.ProcessEnv => ({
	...process.env,
	GIT_DIR: commonDir,
	GIT_WORK_TREE: path,
	GIT_INDEX_FILE: join(adminDir, 'index'),
	// Looking must not write (git would refresh the index): we watch these files.
	GIT_OPTIONAL_LOCKS: '0'
});

/**
 * Runs git on a worktree's files without trusting anything an agent can write. Git uses the
 * repository's own .git directory (so only its config, hooks and filters apply, never the
 * worktree's `config.worktree` or repointed links), the worktree's files, and the worktree's
 * index. `HEAD` therefore means the repository's HEAD here: use `headOf` for the worktree's.
 */
export function gitIn(worktree: Worktree, ...args: string[]): Promise<string> {
	const command = args[0] === '-c' ? args[2] : args[0];
	return git(worktree.path, ['--literal-pathspecs', ...args], {
		env: gitEnv(worktree),
		timeout: ['checkout', 'merge-tree', 'read-tree'].includes(command)
			? CHECKOUT_TIMEOUT
			: undefined
	});
}

/** Latin-1 maps each byte to one character so image blobs survive the text-based Git runner. */
export async function readBlobIn(worktree: Worktree, object: string) {
	const raw = await git(worktree.path, ['--literal-pathspecs', 'cat-file', 'blob', object], {
		env: gitEnv(worktree),
		encoding: 'latin1'
	});
	return Buffer.from(raw, 'latin1');
}
