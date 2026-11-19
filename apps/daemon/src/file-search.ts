import { rm } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import type { FileMatch } from '@geordi/protocol';
import { checkpointName } from './file-index-cache.ts';
import type { FileChanges, FileSource } from './file-index.ts';

const program = new URL(
	import.meta.url.endsWith('.ts') ? './file-index-worker.ts' : './file-index-worker.js',
	import.meta.url
);
type Reply = { id: number; result: FileMatch[] } | { id: number; error: string };

/** Each index lives entirely in its worker. Keep at most two workers. Release an idle index after five minutes. */
export function createFileSearch(cacheDir?: string) {
	type Entry = ReturnType<typeof start>;
	const entries = new Map<string, Entry>();
	let sequence = 0;
	let closed = false;
	let capacity: Promise<void> | undefined;
	let notify: (() => void) | undefined;
	function available() {
		notify?.();
		notify = undefined;
		capacity = undefined;
	}
	function start(key: string, source: FileSource, retain?: () => () => void) {
		const worker = new Worker(program, { workerData: { source, cacheDir } });
		const pending = new Map<
			number,
			{ resolve: (result: FileMatch[]) => void; reject: (error: Error) => void }
		>();
		const release = retain?.();
		let expiry: NodeJS.Timeout | undefined;
		function stop(error = new Error('File index closed')) {
			if (entries.get(key)?.worker !== worker) return;
			entries.delete(key);
			clearTimeout(expiry);
			release?.();
			for (const request of pending.values()) request.reject(error);
			pending.clear();
			available();
			return worker.terminate();
		}
		worker.on('error', stop);
		worker.on('exit', () => stop(new Error('File index worker exited')));
		worker.on('message', (reply: Reply) => {
			const request = pending.get(reply.id);
			if (!request) return;
			pending.delete(reply.id);
			if ('error' in reply) request.reject(new Error(reply.error));
			else request.resolve(reply.result);
			if (!pending.size) {
				expiry = setTimeout(stop, 300_000).unref();
				available();
			}
		});
		function search(query: string) {
			clearTimeout(expiry);
			const id = ++sequence;
			return new Promise<FileMatch[]>((resolve, reject) => {
				pending.set(id, { resolve, reject });
				worker.postMessage({ id, query });
			});
		}
		return { worker, pending, search, stop };
	}
	return {
		async search(key: string, source: FileSource, query: string, retain?: () => () => void) {
			while (!entries.has(key) && entries.size >= 2) {
				const idle = [...entries.values()].find((entry) => !entry.pending.size);
				if (idle) idle.stop();
				else
					await (capacity ??= new Promise((resolve) => {
						notify = resolve;
					}));
			}
			if (closed) throw new Error('File search closed');
			const entry = entries.get(key) ?? start(key, source, retain);
			entries.delete(key);
			entries.set(key, entry);
			return entry.search(query);
		},
		invalidate(key: string, changes?: FileChanges) {
			entries.get(key)?.worker.postMessage({ changes });
		},
		async discard(key: string, path: string) {
			await entries.get(key)?.stop();
			if (cacheDir) await rm(checkpointName(cacheDir, path), { force: true }).catch(() => {});
		},
		close() {
			closed = true;
			for (const entry of entries.values()) entry.stop();
		}
	};
}
