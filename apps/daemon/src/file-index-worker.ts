import { parentPort, workerData } from 'node:worker_threads';
import { buildFileIndex, type FileIndex, type FileSource } from './file-index.ts';

let index: FileIndex | undefined;
let revision = 0;
let pending = Promise.resolve();
parentPort!.on('message', (message: { id: number; query: string } | 'invalidate') => {
	if (message === 'invalidate') {
		revision++;
		index = undefined;
		return;
	}
	// Share one build. If a change arrives during it, the next request gets a fresh index.
	pending = pending.then(async () => {
		try {
			const started = revision;
			const snapshot = index ?? (await buildFileIndex(workerData as FileSource));
			if (started === revision) index = snapshot;
			parentPort!.postMessage({ id: message.id, result: snapshot.search(message.query) });
		} catch (error) {
			parentPort!.postMessage({
				id: message.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	});
});
