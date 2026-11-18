/** Look again after the provider has had time to publish a PR opened during a turn. */
export function createUpstreamRefresh(
	watched: (worktreeId: string) => Promise<void> | undefined,
	background: (worktreeId: string) => Promise<void>
) {
	const latest = new Map<string, symbol>();
	return (id: string) => {
		const request = Symbol();
		latest.set(id, request);
		const look = () => watched(id) ?? background(id);
		void look().then(() => {
			if (latest.get(id) !== request) return;
			setTimeout(() => {
				if (latest.get(id) !== request) return;
				latest.delete(id);
				void look();
			}, 10_000).unref();
		});
	};
}
