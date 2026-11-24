// Parcel delivers batches from its native watcher thread. Only open native workspaces
// need a recursive subscription. The forge reloads their Changes view on notification.
import type watcher from '@parcel/watcher';
import type { WorktreeRef } from '@geordi/protocol';

export function nativeWatches(pathOf: (ref: WorktreeRef) => string, changed: (id: string) => void) {
	const active = new Map<string, () => void>();
	function stop(id: string) {
		active.get(id)?.();
		active.delete(id);
	}
	function set(refs: WorktreeRef[]) {
		const wanted = new Set(refs.map((ref) => ref.worktreeId));
		for (const id of active.keys()) if (!wanted.has(id)) stop(id);
		for (const ref of refs) {
			const id = ref.worktreeId;
			if (active.has(id)) continue;
			let closed = false;
			let timer: NodeJS.Timeout | undefined;
			const notify = () => {
				if (!closed && !timer)
					timer = setTimeout(() => {
						timer = undefined;
						changed(id);
					}, 200);
			};
			// kqueue also delivers events on macOS hosts where FSEvents is unavailable.
			// Parcel documents the backend but omits it from its TypeScript declaration.
			const opts: watcher.Options = {
				ignore: ['.jj', '.context', '**/node_modules', '**/.git'],
				...(process.platform === 'darwin' && { backend: 'kqueue' as watcher.BackendType })
			};
			const subscription = import('@parcel/watcher')
				.then(({ default: watcher }) =>
					watcher.subscribe(
						pathOf(ref),
						(error) => {
							if (error) console.warn('Native workspace watcher:', error.message);
							notify();
						},
						opts
					)
				)
				.then(
					(sub) => {
						notify();
						return sub;
					},
					(error) => {
						if (!closed) {
							active.delete(id);
							console.warn('Native workspace watcher:', error.message);
						}
						return undefined;
					}
				);
			active.set(id, () => {
				closed = true;
				clearTimeout(timer);
				void subscription.then((sub) => sub?.unsubscribe()).catch(console.warn);
			});
		}
	}
	return { set, stop };
}
