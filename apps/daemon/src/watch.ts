import { watch, type FSWatcher } from 'node:fs';
import { join, sep } from 'node:path';
import type { WatchScope, WorktreeRef } from '@geordi/protocol';
import { branchOf, type Worktree } from './worktree.ts';

/** Changes come in bursts (a save, a checkout, an install); report each burst once. */
const SETTLE_MS = 250;

/**
 * Calls `onChange` when anything changes that the workspace's changes or pull request
 * depend on: its files, what it has checked out and staged, and the repository's branches
 * (commits, and pushes, which move the remote-tracking branches). Returns a function that
 * stops watching.
 *
 * Without `files` (a worktree nobody has open), only its Git state: a handful of small
 * directories, cheap on every platform (our own Git leaves the index alone:
 * `GIT_OPTIONAL_LOCKS`). And of the branches, which every worktree of the repository shares,
 * only its own, here and on the remotes: a fetch or a commit elsewhere is none of its business.
 */
export function watchWorktree(worktree: Worktree, onChange: () => void, files = true): () => void {
	let settle: NodeJS.Timeout | undefined;
	const report = () => {
		clearTimeout(settle);
		settle = setTimeout(onChange, SETTLE_MS);
	};
	// lock files come and go around every git command, including ones that change nothing
	const quiet = (file: string | Buffer | null) => !!file?.toString().endsWith('.lock');
	const changed = (_event: string, file: string | Buffer | null) => {
		if (!quiet(file)) report();
	};
	const refChanged = (_event: string, file: string | Buffer | null) => {
		if (!quiet(file) && (files || !file || concerns(worktree, file.toString()))) report();
	};
	const repoChanged = (_event: string, file: string | Buffer | null) => {
		if (!quiet(file) && (files || !file || file.toString() === 'packed-refs')) report();
	};

	const watchers: FSWatcher[] = [];
	const add = (
		path: string,
		listener: (event: string, file: string | Buffer | null) => void,
		recursive = false
	) => {
		try {
			// a vanished directory is not our problem; the next change elsewhere still reports
			watchers.push(watch(path, { recursive }, listener).on('error', () => {}));
		} catch {
			// not there (yet): nothing to watch
		}
	};
	if (files) add(worktree.path, changed, true);
	add(worktree.adminDir, changed);
	add(worktree.commonDir, repoChanged);
	add(join(worktree.commonDir, 'refs'), refChanged, true);

	return () => {
		clearTimeout(settle);
		for (const watcher of watchers) watcher.close();
	};
}

/**
 * Whether a ref (a path below `refs/`) is the worktree's branch, or that branch on a remote.
 * The branch is read when asked: the worktree may have moved to another since.
 */
export function concerns(worktree: Worktree, ref: string): boolean {
	let branch: string | null;
	try {
		branch = branchOf(worktree);
	} catch {
		return true; // can't tell: better once too often
	}
	if (!branch) return false;
	const [kind, ...rest] = ref.split(sep);
	if (kind === 'heads') return rest.join('/') === branch;
	// remotes/<remote>/<branch>
	return kind === 'remotes' && rest.slice(1).join('/') === branch;
}

/**
 * Keeps watching exactly the workspaces the forge asks for: the ones someone is looking at
 * (`open`), files and all, and every other one in use (`background`), only its Git state,
 * so that the sidebar can say at once how each stands. `locate` finds a workspace's
 * worktree (and throws if it has none yet).
 */
export function createWatches(
	locate: (ref: WorktreeRef) => Promise<Worktree>,
	onChange: (worktreeId: string) => void
) {
	const wanted: Record<WatchScope, WorktreeRef[]> = { open: [], background: [] };
	const watching = new Map<string, { stop: () => void; files: boolean }>();

	function apply() {
		const all = [...wanted.open, ...wanted.background];
		const open = new Set(wanted.open.map((ref) => ref.worktreeId));
		const ids = new Set(all.map((ref) => ref.worktreeId));
		for (const [id, { stop, files }] of watching)
			if (!ids.has(id) || files !== open.has(id)) {
				stop();
				watching.delete(id);
			}
		for (const ref of all) {
			const id = ref.worktreeId;
			if (watching.has(id)) continue;
			const files = open.has(id);
			const entry = { files, stop: () => {} };
			watching.set(id, entry);
			void locate(ref)
				.then((worktree) => {
					// The scope, worktree or connection may have changed while locating it.
					if (watching.get(id) === entry)
						entry.stop = watchWorktree(worktree, () => onChange(id), files);
				})
				.catch(() => {
					if (watching.get(id) === entry) watching.delete(id);
				});
		}
	}

	return {
		/** A discovered or retargeted pull changes this comparison and its descendants. */
		targetChanged(id: string) {
			for (const ref of wanted.open)
				if (ref.worktreeId === id || ref.parents?.some((parent) => parent.worktreeId === id))
					onChange(ref.worktreeId);
		},
		/** Replaces one set of watched workspaces. */
		set(worktrees: WorktreeRef[], scope: WatchScope = 'open') {
			wanted[scope] = worktrees;
			apply();
		},
		/**
		 * Call when a worktree was created, or came back: a wanted workspace may have been
		 * waiting for it, or still be watching a directory that is no longer the one there.
		 */
		restart(worktreeId: string) {
			watching.get(worktreeId)?.stop();
			watching.delete(worktreeId);
			apply();
		},
		stop: () => {
			wanted.open = [];
			wanted.background = [];
			apply();
		}
	};
}
