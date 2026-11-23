import { watch, type FSWatcher } from 'node:fs';
import { parentPort } from 'node:worker_threads';

/** What the daemon asks of its watcher thread. */
export type WatchRequest =
	{ type: 'watch'; id: number; dir: string; recursive: boolean } | { type: 'unwatch'; id: number };

/** What happened below a watched directory: a name relative to it (`null`: it can't say), or that it lost track. */
export type WatchEvent =
	{ id: number; event: string; file: string | null } | { id: number; error: true };

/**
 * Node's watchers, in a thread of their own. On macOS they share one FSEvents stream, which
 * is rebuilt whenever one of them stops, and the thread that stops it waits for that: with
 * some fifty of them, for a tenth of a second or more each time. Here that holds up nothing
 * but this thread.
 */
const port = parentPort!;
const watchers = new Map<number, FSWatcher>();

port.on('message', (request: WatchRequest) => {
	if (request.type === 'unwatch') {
		watchers.get(request.id)?.close();
		watchers.delete(request.id);
		return;
	}
	const { id, dir, recursive } = request;
	try {
		const watcher = watch(dir, { recursive }, (event, file) =>
			port.postMessage({ id, event, file: file?.toString() ?? null } satisfies WatchEvent)
		);
		watcher.on('error', () => port.postMessage({ id, error: true } satisfies WatchEvent));
		watchers.set(id, watcher);
	} catch {
		// not there (yet): nothing to watch
	}
});
