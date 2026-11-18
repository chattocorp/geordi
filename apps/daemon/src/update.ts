import { baseOf, uncommittedFiles, type Origin } from './changes.ts';
import { fetchUpstream, gitIn, headOf, type Worktree } from './worktree.ts';

/** Whether a git command went through: for the ones that answer by how they end. */
const succeeds = async (worktree: Worktree, ...args: string[]) => {
	try {
		await gitIn(worktree, ...args);
		return true;
	} catch {
		return false;
	}
};

/**
 * A commit that merges `theirs` into `ours`, made in the repository alone: no file of the
 * worktree is touched. `null` if the two conflict, or there is no making a commit here (no
 * author configured, or commits are to be signed, which may ask for a passphrase).
 */
async function merged(worktree: Worktree, ours: string, theirs: string, message: string) {
	let signs = false;
	try {
		signs =
			(await gitIn(worktree, 'config', '--get', '--type=bool', 'commit.gpgsign')).trim() === 'true';
	} catch {
		// not set
	}
	if (signs) return null;
	try {
		// ends with an error where the two conflict
		const tree = (await gitIn(worktree, 'merge-tree', '--write-tree', ours, theirs)).trim();
		return (
			await gitIn(worktree, 'commit-tree', tree, '-p', ours, '-p', theirs, '-m', message)
		).trim();
	} catch {
		return null;
	}
}

/**
 * Brings the latest of the branch a workspace's work is based on into its branch, the way
 * `git merge` would: fast-forward where the branch has no commits of its own, a merge
 * commit otherwise. Fetches first where that branch is the upstream's.
 *
 * Only where git can do it by itself. Resolves to `false`, with everything as it was, where
 * it takes judgement: uncommitted changes, conflicts, no branch checked out.
 *
 * Without running git inside the worktree, whose own Git metadata is the agent's to write
 * (see `gitIn`, and `continueOn`): the commit is made in the repository, the branch moved
 * there, and the worktree's files and index set to it from outside. So no hooks run.
 */
export async function update(
	worktree: Worktree,
	origin: Origin,
	{
		fetch = fetchUpstream,
		working = () => false
	}: { fetch?: typeof fetchUpstream; working?: () => boolean } = {}
): Promise<boolean> {
	if (working()) return false;
	const base = await baseOf(origin);
	if (!base) return false;
	if (base.startsWith('refs/remotes/')) {
		const problem = await fetch(origin.repoPath);
		// then from what is known, which is what was offered
		if (problem) console.warn(`could not fetch ${origin.repoPath}: ${problem}`);
		if (working()) return false;
	}

	const head = headOf(worktree);
	if (!head.startsWith('refs/heads/')) return false;
	if ((await uncommittedFiles(worktree)).length > 0) return false;

	const commit = async (rev: string) =>
		(await gitIn(worktree, 'rev-parse', '--verify', `${rev}^{commit}`)).trim();
	const ours = await commit(head);
	const theirs = await commit(base);
	const within = async (a: string, b: string) =>
		await succeeds(worktree, 'merge-base', '--is-ancestor', a, b);
	if (await within(theirs, ours)) return true; // nothing to bring in

	// named as git names them in a merge's message
	const branch = head.slice('refs/heads/'.length);
	const from = base.startsWith('refs/remotes/')
		? `remote-tracking branch '${base.slice('refs/remotes/'.length)}'`
		: `branch '${base.slice('refs/heads/'.length)}'`;
	const forward = await within(ours, theirs);
	const next = forward
		? theirs
		: await merged(worktree, ours, theirs, `Merge ${from} into ${branch}`);
	if (!next) return false;

	// The branch first, and only from where we found it: whoever moved it meanwhile wins.
	const move = async (to: string, was: string, why: string) =>
		await gitIn(worktree, 'update-ref', '-m', why, head, to, was);
	await move(next, ours, `merge ${from}: ${forward ? 'Fast-forward' : 'Merge made by Geordi'}`);
	try {
		// refuses, before changing anything, to overwrite a file that is in the way
		await gitIn(worktree, 'read-tree', '-m', '-u', ours, next);
	} catch {
		await move(ours, next, 'reset: the merge could not be checked out');
		return false;
	}
	return true;
}
