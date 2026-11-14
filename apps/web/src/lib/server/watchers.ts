import type { WorktreeRef } from '@geordi/protocol';
import type { Dispatch } from './workspaces.ts';

/**
 * Knows which worktrees someone is looking at (through a workspace that works in them), has
 * a daemon watch their files, and tells the viewers when something changed. Nothing here is stored (ADR-003): a daemon that
 * reconnects is simply told again what to watch.
 */
export function createWatchers(dispatch: Dispatch, ref: (worktreeId: string) => WorktreeRef) {
	/** Viewers by worktree: each a function to call when its files change. */
	const watched = new Map<string, Set<() => void>>();
	/** Grows with every change, so viewers can tell that there was one. */
	let revision = 0;

	/**
	 * Tells the daemon the whole set; it works out what to start and stop watching. One
	 * workspace that can't be resolved must not keep the others from being watched.
	 */
	function sync() {
		const worktrees = [...watched.keys()].flatMap((id) => {
			try {
				return [ref(id)];
			} catch {
				return [];
			}
		});
		dispatch({ type: 'watch', worktrees });
	}

	return {
		/**
		 * Registers a viewer of a workspace, to be told of changes to its files. Returns a
		 * function that ends it. Watching starts with the first viewer and ends with the last.
		 */
		watch(worktreeId: string, changed: () => void): () => void {
			ref(worktreeId); // throws for unknown worktrees, before anything is registered
			let viewers = watched.get(worktreeId);
			if (!viewers) watched.set(worktreeId, (viewers = new Set()));
			viewers.add(changed);
			if (viewers.size === 1) sync();

			return () => {
				viewers.delete(changed);
				if (viewers.size === 0 && watched.get(worktreeId) === viewers) {
					watched.delete(worktreeId);
					sync();
				}
			};
		},

		/** A number that is different after every change to any watched workspace. */
		revision: () => revision,

		/** A daemon reports that a workspace's files changed. */
		changed(worktreeId: string) {
			revision++;
			for (const viewer of watched.get(worktreeId) ?? []) viewer();
		},

		/** A daemon (re)connected: it watches nothing until told. */
		resync: sync
	};
}
