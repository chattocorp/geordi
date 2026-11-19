import { parentPort, workerData } from 'node:worker_threads';
import { loadFileIndex, readExcludesState } from './file-index-cache.ts';
import {
	refreshFileIndex,
	addFileScope,
	type FileChanges,
	type FileIndex,
	type FileSource
} from './file-index.ts';

const { source, cacheDir } = workerData as { source: FileSource; cacheDir?: string };
let index: FileIndex | undefined;
const dirty = new Set<string>();
let gitIndex = false;
let excludes: Awaited<ReturnType<typeof readExcludesState>> | undefined;
let revision = 0;
let pending = Promise.resolve();

parentPort!.on('message', (message: { id: number; query: string } | { changes?: FileChanges }) => {
	if (!('id' in message)) {
		gitIndex ||= !!message.changes?.gitIndex;
		if (
			!message.changes ||
			!message.changes.paths.every((path) => addFileScope(dirty, index?.changeScope(path) ?? path))
		) {
			revision++;
			index = undefined;
			dirty.clear();
		}
		return;
	}
	pending = pending.then(async () => {
		try {
			const started = revision;
			const changes = { paths: [...dirty], gitIndex };
			gitIndex = false;
			dirty.clear();
			let snapshot = index;
			// Git may read ignore rules outside every directory the worktree watcher covers.
			if ('worktree' in source) {
				const next = await readExcludesState(source.worktree, snapshot && excludes?.path).catch(
					() => undefined
				);
				if (!next || next.stamp !== excludes?.stamp) snapshot = undefined;
				excludes = next;
			}
			if (!snapshot)
				snapshot = await loadFileIndex(source, cacheDir, started === 0, excludes?.stamp);
			else if (changes.paths.length || changes.gitIndex)
				snapshot = await refreshFileIndex(snapshot, source, changes);
			// Events arriving during either operation are still pending for the next request.
			if (started === revision) index = snapshot;
			parentPort!.postMessage({ id: message.id, result: snapshot.search(message.query) });
		} catch (error) {
			index = undefined;
			parentPort!.postMessage({
				id: message.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	});
});
