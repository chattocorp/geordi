import { git } from './git.ts';
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readFileSync,
	realpathSync
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, sep } from 'node:path';
import {
	MAX_IMAGE_BYTES,
	pictureTypeOf,
	soundTypeOf,
	type FileContent,
	type Changes,
	type FileChange,
	type FileVersions
} from '@geordi/protocol';
import {
	branchOf,
	branchOn,
	branchRef,
	readBlobIn,
	gitIn,
	headOf,
	startOf,
	upstreamBranchOf,
	type Worktree
} from './worktree.ts';

/** Files are for reading; beyond this size (in bytes) they are not shown. */
const MAX_FILE = 1_000_000;
/**
 * Never run code the worktree can supply: no diff drivers, and no looking inside submodules
 * (git would run itself in them, under whatever config the agent put there).
 */
const SAFE = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=all'];

/** Where a workspace's changes are measured from: its repository, and the branch it started from. */
export type Origin = {
	repoPath: string;
	base?: string;
	/** The branch its pull request merges into, where it has one: that is what it is measured against. */
	pullBase?: string;
};

/** The one branch a workspace is measured against: its pull request's target, else its base. */
async function comparison(worktree: Worktree, origin: Origin) {
	const target = origin.pullBase
		? branchRef(origin.pullBase).replace('refs/heads/', 'refs/remotes/origin/')
		: ((await baseOf(origin)) ??
			// a base that is gone (merged and deleted) leaves where work in the repository starts
			(await baseOf({ repoPath: origin.repoPath })) ??
			(await git(origin.repoPath, ['rev-parse', 'HEAD'])).trim());
	const fork = (await gitIn(worktree, 'merge-base', headOf(worktree), target)).trim();
	return { fork, name: target.replace(/^refs\/(?:heads\/|remotes\/origin\/)/, '') };
}

const untracked = async (worktree: Worktree, ...paths: string[]) =>
	(await gitIn(worktree, 'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths))
		.split('\0')
		.filter(Boolean);

/**
 * The bytes of a file in the worktree, or `null` if it is not a readable, regular file
 * that really is inside the worktree.
 *
 * An agent can swap any part of the path for a symlink at any moment. So the path must
 * resolve to itself both before and after opening, the file is opened without following a
 * link, and what we opened must be what the path names afterwards. Size and type are
 * checked on the open file, not on the path. Opening never waits (a named pipe would block
 * the whole daemon otherwise).
 */
function readBytes(worktree: Worktree, path: string, limit: number): Buffer | null {
	if (
		isAbsolute(path) ||
		path.split(sep).some((part) => part === '..' || part.toLowerCase() === '.git')
	)
		return null;
	let fd: number;
	let file: string;
	try {
		file = join(realpathSync(worktree.path), path);
		if (realpathSync(file) !== file) return null;
		fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	} catch {
		return null;
	}
	try {
		const opened = fstatSync(fd);
		const named = lstatSync(file);
		const same = opened.dev === named.dev && opened.ino === named.ino;
		if (!same || realpathSync(file) !== file) return null;
		if (!opened.isFile() || opened.size > limit) return null;
		return readFileSync(fd);
	} catch {
		return null;
	} finally {
		closeSync(fd);
	}
}

function asText(bytes: Buffer | null) {
	return bytes && bytes.length <= MAX_FILE && !bytes.includes(0) ? bytes.toString('utf8') : null;
}

export function readText(worktree: Worktree, path: string) {
	return asText(readBytes(worktree, path, MAX_FILE));
}

function fileContent(bytes: Buffer | null): FileContent | null {
	if (!bytes || bytes.length > MAX_IMAGE_BYTES) return null;
	const sound = soundTypeOf(bytes);
	if (sound) return { mediaType: sound, data: bytes.toString('base64') };
	const mediaType = pictureTypeOf(bytes);
	if (mediaType && mediaType !== 'image/svg+xml')
		return { mediaType, data: bytes.toString('base64') };
	return asText(bytes) ?? (mediaType && { mediaType, data: bytes.toString('base64') });
}

export function readWorktreePicture(worktree: Worktree, path: string) {
	const bytes = readBytes(worktree, path, MAX_IMAGE_BYTES);
	if (!bytes) return null;
	const sound = soundTypeOf(bytes);
	if (sound) return { mediaType: sound, data: bytes.toString('base64') };
	const mediaType = pictureTypeOf(bytes);
	return mediaType && { mediaType, data: bytes.toString('base64') };
}

export function readSource(worktree: Worktree, path: string) {
	return fileContent(readBytes(worktree, path, MAX_IMAGE_BYTES));
}

/** How many untracked files get their lines counted. */
const MAX_COUNTED = 200;

const lines = (text: string) => (text ? text.replace(/\n$/, '').split('\n') : []);

const STATUS: Record<string, FileChange['status']> = { A: 'added', D: 'deleted', R: 'renamed' };

function fileStates(fields: string[]) {
	// `--name-status -z`: a status, then the path; a rename has the old path and the new.
	const states = new Map<string, Pick<FileChange, 'status' | 'from'>>();
	for (let i = 0; i < fields.length - 1;) {
		const status = fields[i++];
		const path = fields[i++];
		if (status.startsWith('R')) states.set(fields[i++], { status: 'renamed', from: path });
		else states.set(path, { status: STATUS[status] ?? 'modified' });
	}

	return states;
}

/** Pair Git's NUL-delimited --name-status and --numstat results, including rename pairs. */
export function parseFileChanges(names: string[], fields: string[]): FileChange[] {
	const states = fileStates(names);

	// `--numstat -z`: counts and the path; a rename has no path there, but two after it.
	const tracked: FileChange[] = [];
	for (let i = 0; i < fields.length - 1;) {
		const [added, removed, ...rest] = fields[i++].split('\t');
		let path = rest.join('\t');
		if (!path) {
			i++; // old name
			path = fields[i++];
		}
		const count = (value: string) => (value === '-' ? null : Number(value));
		tracked.push({
			path,
			...(states.get(path) ?? { status: 'modified' }),
			added: count(added),
			removed: count(removed)
		});
	}

	return tracked;
}

export async function changes(worktree: Worktree, origin: Origin): Promise<FileChange[]> {
	const [{ fork }, others] = await Promise.all([comparison(worktree, origin), untracked(worktree)]);
	return filesSince(worktree, fork, others);
}

async function trackedChanges(worktree: Worktree, base: string, options: string[]) {
	const diff = async (format: string) =>
		(await gitIn(worktree, 'diff', format, '-z', ...SAFE, base, ...options)).split('\0');
	const [names, fields] = await Promise.all([diff('--name-status'), diff('--numstat')]);
	return parseFileChanges(names, fields);
}

async function filesSince(
	worktree: Worktree,
	base: string,
	others: string[]
): Promise<FileChange[]> {
	const tracked = await trackedChanges(worktree, base, ['-M']);
	const untrackedPaths = new Set(others);
	const recreated = tracked
		.filter((file) => untrackedPaths.has(file.path))
		.map((file) => file.path);
	let files = tracked;
	if (recreated.length) {
		// A path deleted from the index can exist again on disk. Compare its current
		// contents with the base, using a temporary index that still tracks the path.
		files = tracked.filter((file) => !untrackedPaths.has(file.path));
		for (const path of recreated) untrackedPaths.delete(path);
		const adminDir = await mkdtemp(join(tmpdir(), 'geordi-compare-'));
		try {
			const comparison = { ...worktree, adminDir };
			await gitIn(comparison, 'read-tree', base);
			for (let i = 0; i < recreated.length; i += 32) {
				files.push(
					...(await trackedChanges(comparison, base, [
						'--no-renames',
						'--',
						...recreated.slice(i, i + 32)
					]))
				);
			}
		} finally {
			await rm(adminDir, { recursive: true, force: true });
		}
	}

	// Reading files to count their lines is only worth it for a workspace's own handful of new
	// files, not for a `node_modules` nobody ignored: beyond that, they are just listed.
	const added = [...untrackedPaths].map((path, index): FileChange => {
		const text = index < MAX_COUNTED ? readText(worktree, path) : null;
		return {
			path,
			status: 'added',
			added: text === null ? null : lines(text).length,
			removed: text === null ? null : 0
		};
	});

	return [...files, ...added].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The files with changes that are not committed: modified, staged, or new. Not `git
 * status`: `gitIn` runs against the repository's own .git, whose HEAD is not the worktree's.
 */
export async function uncommittedFiles(worktree: Worktree): Promise<string[]> {
	const [modified, others] = await Promise.all([modifiedFiles(worktree), untracked(worktree)]);
	return [...new Set([...modified, ...others])].sort();
}

async function modifiedFiles(worktree: Worktree) {
	// Compare the index and working files separately. A file can match HEAD on disk
	// while the index holds a staged edit that removing the worktree would lose.
	const args = ['diff', '--name-only', '--no-renames', '-z', ...SAFE];
	const [staged, unstaged] = await Promise.all([
		gitIn(worktree, ...args, '--cached', headOf(worktree)),
		gitIn(worktree, ...args)
	]);
	return (staged + unstaged).split('\0').filter(Boolean);
}

/**
 * Whether the branch has had commits of its own, all of which are in the branch it started
 * from by now. The branch's own history (its reflog, in the repository) says where it was
 * made and how it moved: a branch that was only made, renamed, fast-forwarded (as syncing
 * with its base does) or reset has had no work to land.
 */
/** Whether a reflog entry put commits of the branch's own on it, rather than moving it to others. */
// Git writes `branch: Created from …` but `Branch: renamed …`.
const ownWork = (move: string) => !/: Fast-forward$|^reset:|^branch:/i.test(move);

async function landed(worktree: Worktree, origin: Origin, head: string): Promise<boolean> {
	if (!head.startsWith('refs/heads/')) return false;
	try {
		const tip = (await gitIn(worktree, 'rev-parse', head)).trim();
		const moves = (await gitIn(worktree, 'reflog', 'show', '--format=%gs', head))
			.trim()
			.split('\n')
			.slice(0, -1); // the last is where it was made
		if (!moves.some(ownWork)) return false;
		const start = await baseOf(origin);
		if (!start) return false;
		await gitIn(worktree, 'merge-base', '--is-ancestor', tip, start); // throws if it is not
		return true;
	} catch {
		return false;
	}
}

/**
 * The branch a workspace's work is based on, as a full ref (`refs/remotes/origin/main`, or
 * the branch of the workspace that started it); `null` where there is none to name.
 */
export async function baseOf({ repoPath, base }: Origin): Promise<string | null> {
	try {
		const ref = base ? await branchOn(repoPath, base) : await startOf(repoPath);
		if (!ref) return null;
		// Resolve HEAD in the source repository, never in the workspace.
		const branch = (await git(repoPath, ['rev-parse', '--symbolic-full-name', ref])).trim();
		return branch.startsWith('refs/') ? branch : null;
	} catch {
		return null;
	}
}

/** Compare against the base as last fetched; a missing base is unknown, not up to date. */
async function incoming(worktree: Worktree, origin: Origin): Promise<Changes['incoming']> {
	const branch = await baseOf(origin);
	if (!branch) return null;
	try {
		const commits = Number(
			(await gitIn(worktree, 'rev-list', '--count', `${headOf(worktree)}..${branch}`)).trim()
		);
		return { branch, commits };
	} catch {
		return null;
	}
}

/** The workspace's changes, and how far they have got: committed? pushed? */
const loading = new Map<string, Promise<Changes>>();

export function status(worktree: Worktree, origin: Origin): Promise<Changes> {
	const key = JSON.stringify([worktree.path, origin.repoPath, origin.base, origin.pullBase]);
	let result = loading.get(key);
	if (!result) {
		result = readStatus(worktree, origin).finally(() => loading.delete(key));
		loading.set(key, result);
	}
	return result;
}

async function readStatus(worktree: Worktree, origin: Origin): Promise<Changes> {
	const head = headOf(worktree);
	const [{ fork, name }, modified, others] = await Promise.all([
		comparison(worktree, origin),
		modifiedFiles(worktree),
		untracked(worktree)
	]);

	// What is on the remote, as far as this machine knows: the remote-tracking branch.
	let unpushed: number | null = null;
	if (head.startsWith('refs/heads/')) {
		// under whatever name the branch was pushed
		const branch = await upstreamBranchOf(origin.repoPath, head.slice('refs/heads/'.length));
		const remote = `refs/remotes/origin/${branch}`;
		try {
			unpushed = Number(
				(await gitIn(worktree, 'rev-list', '--count', `${remote}..${head}`)).trim()
			);
		} catch {
			// no such remote branch: nothing of this branch is pushed
		}
	}

	const [files, tip] = await Promise.all([
		filesSince(worktree, fork, others),
		gitIn(worktree, 'rev-parse', head)
	]);
	const [isLanded, behind] = await Promise.all([
		landed(worktree, origin, head),
		incoming(worktree, origin)
	]);

	return {
		branch: branchOf(worktree),
		comparisonTarget: name,
		files,
		unmerged: tip.trim() !== fork,
		uncommitted: new Set([...modified, ...others]).size,
		unpushed,
		landed: isLanded,
		incoming: behind
	};
}

/**
 * Both versions of a changed file, for a diff viewer. Only files that `changes` lists: that
 * keeps `path` inside the worktree, and away from whatever a symlink in it points to.
 */
export async function versions(
	worktree: Worktree,
	origin: Origin,
	path: string
): Promise<FileVersions> {
	const missing = { unavailable: 'This file has no changes any more.' };
	if (
		isAbsolute(path) ||
		path.includes('\0') ||
		path
			.split(sep)
			.some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')
	)
		return missing;
	const { fork } = await comparison(worktree, origin);
	const diff = (...args: string[]) =>
		gitIn(worktree, 'diff', '--name-status', '-z', '-M', ...SAFE, fork, ...args);
	const state = fileStates((await diff('--', path)).split('\0')).get(path);
	let beforePath = path;
	if (state?.status === 'added' || state?.status === 'deleted') {
		// Filtering by destination hides the source of a rename. Ask for rename pairs only.
		const renames = fileStates((await diff('--diff-filter=R')).split('\0'));
		beforePath = renames.get(path)?.from ?? path;
		if ([...renames.values()].some((rename) => rename.from === path)) {
			if (!(await untracked(worktree, path)).includes(path)) return missing;
		}
	} else if (!state && !(await untracked(worktree, path)).includes(path)) return missing;

	const unavailable = { unavailable: 'This file is binary, too large or not a regular file.' };
	let old: FileContent | null = null;
	const before = `${fork}:${beforePath}`;
	let size: number | undefined;
	try {
		size = Number(await gitIn(worktree, 'cat-file', '-s', before));
	} catch {
		// A new file has no blob at the fork point.
	}
	if (size !== undefined) {
		if (size > MAX_IMAGE_BYTES) return unavailable;
		old = fileContent(await readBlobIn(worktree, before));
		if (old === null) return unavailable;
	}
	const exists = lstatSync(join(worktree.path, path), { throwIfNoEntry: false });
	const now = exists ? readSource(worktree, path) : null;
	if (exists && now === null) return unavailable;
	return { old, new: now };
}
