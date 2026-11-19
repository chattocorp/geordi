import { parentPort, workerData } from 'node:worker_threads';
import {
	buildFileIndex,
	refreshFileIndex,
	MAX_FILE_CHANGES,
	type FileChanges,
	type FileIndex,
	type FileSource
} from './file-index.ts';

const source = workerData as FileSource;
let index: FileIndex | undefined;
const dirty = new Set<string>();
let gitIndex = false;
let revision = 0;
let pending = Promise.resolve();

parentPort!.on('message', (message: { id: number; query: string } | { changes?: FileChanges }) => {
	if (!('id' in message)) {
		gitIndex ||= !!message.changes?.gitIndex;
		for (const path of message.changes?.paths ?? []) dirty.add(path);
		if (!message.changes || dirty.size > MAX_FILE_CHANGES) {
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
			if (!snapshot) snapshot = await buildFileIndex(source);
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
