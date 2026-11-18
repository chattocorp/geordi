import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { WatchScope, WorktreeRef } from '@geordi/protocol';
import type { Worktree } from './worktree.ts';

/** Changes come in bursts (a save, a checkout, an install); report each burst once. */
const SETTLE_MS = 250;

/**
 * Calls `onChange` when anything changes that the workspace's changes or pull request
 * depend on: its files, what it has checked out and staged, and the repository's branches
 * (commits, and pushes, which move the remote-tracking branches). Returns a function that
 * stops watching.
 */
export function watchWorktree(worktree: Worktree, onChange: () => void): () => void {
	let settle: NodeJS.Timeout | undefined;
	const changed = (_event: string, file: string | Buffer | null) => {
		// lock files come and go around every git command, including ones that change nothing
		if (file?.toString().endsWith('.lock')) return;
		clearTimeout(settle);
		settle = setTimeout(onChange, SETTLE_MS);
	};

	const watchers: FSWatcher[] = [];
	const add = (path: string, recursive = false) => {
		try {
			// a vanished directory is not our problem; the next change elsewhere still reports
			watchers.push(watch(path, { recursive }, changed).on('error', () => {}));
		} catch {
			// not there (yet): nothing to watch
		}
	};
	add(worktree.path, true);
	add(worktree.adminDir);
	add(worktree.commonDir);
	add(join(worktree.commonDir, 'refs'), true);

	return () => {
		clearTimeout(settle);
		for (const watcher of watchers) watcher.close();
	};
}

/**
 * Keeps watching exactly the workspaces the forge asks for: the ones someone is looking at
 * (`open`), and every other one in use (`background`, so that the sidebar can say at once
 * how each stands). `locate` finds a workspace's worktree (and throws if it has none yet).
 */
export function createWatches(
	locate: (ref: WorktreeRef) => Worktree,
	onChange: (worktreeId: string) => void
) {
	const wanted: Record<WatchScope, WorktreeRef[]> = { open: [], background: [] };
	const watching = new Map<string, () => void>();

	function apply() {
		const all = [...wanted.open, ...wanted.background];
		const ids = new Set(all.map((ref) => ref.worktreeId));
		for (const [id, stop] of watching)
			if (!ids.has(id)) {
				stop();
				watching.delete(id);
			}
		for (const ref of all) {
			const id = ref.worktreeId;
			if (watching.has(id)) continue;
			try {
				watching.set(
					id,
					watchWorktree(locate(ref), () => onChange(id))
				);
			} catch {
				// no worktree yet; `refresh()` picks it up once there is one
			}
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
			watching.get(worktreeId)?.();
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
