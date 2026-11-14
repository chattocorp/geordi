import type { WorkspaceRef } from '@geordi/protocol';
import type { Dispatch } from './workspaces.ts';

/**
 * Knows which workspaces someone is looking at, has a daemon watch their files, and tells
 * the viewers when something changed. Nothing here is stored (ADR-003): a daemon that
 * reconnects is simply told again what to watch.
 */
export function createWatchers(dispatch: Dispatch, ref: (workspaceId: string) => WorkspaceRef) {
	/** Viewers by workspace: each a function to call when its files change. */
	const watched = new Map<string, Set<() => void>>();
	/** Grows with every change, so viewers can tell that there was one. */
	let revision = 0;

	/**
	 * Tells the daemon the whole set; it works out what to start and stop watching. One
	 * workspace that can't be resolved must not keep the others from being watched.
	 */
	function sync() {
		const workspaces = [...watched.keys()].flatMap((id) => {
			try {
				return [ref(id)];
			} catch {
				return [];
			}
		});
		dispatch({ type: 'watch', workspaces });
	}

	return {
		/**
		 * Registers a viewer of a workspace, to be told of changes to its files. Returns a
		 * function that ends it. Watching starts with the first viewer and ends with the last.
		 */
		watch(workspaceId: string, changed: () => void): () => void {
			ref(workspaceId); // throws for unknown workspaces, before anything is registered
			let viewers = watched.get(workspaceId);
			if (!viewers) watched.set(workspaceId, (viewers = new Set()));
			viewers.add(changed);
			if (viewers.size === 1) sync();

			return () => {
				viewers.delete(changed);
				if (viewers.size === 0 && watched.get(workspaceId) === viewers) {
					watched.delete(workspaceId);
					sync();
				}
			};
		},

		/** A number that is different after every change to any watched workspace. */
		revision: () => revision,

		/** A daemon reports that a workspace's files changed. */
		changed(workspaceId: string) {
			revision++;
			for (const viewer of watched.get(workspaceId) ?? []) viewer();
		},

		/** A daemon (re)connected: it watches nothing until told. */
		resync: sync
	};
}
