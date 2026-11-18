/** Order daemon operations that create, change, remove or start work in the same directory. */
const pending = new Map<string, Promise<unknown>>();

export function inWorktree<T>(path: string, task: () => Promise<T>): Promise<T> {
	const previous = pending.get(path) ?? Promise.resolve();
	const result = previous.then(task, task);
	pending.set(path, result);
	const finished = () => {
		if (pending.get(path) === result) pending.delete(path);
	};
	void result.then(finished, finished);
	return result;
}
