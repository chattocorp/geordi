/**
 * Notices when a forge refuses us for asking too much, and says until when to leave it be.
 * The `forges` library waits out a short refusal itself and retries once; meanwhile every
 * other read would run into the same wall, and keep the limit going. So the first refusal
 * pauses background reads (ADR-006: upstream state is asked on demand, and can wait).
 */

/** How long to pause when a refusal names no time. */
const DEFAULT_PAUSE_MS = 60_000;

/**
 * Until when a response says to stop asking, or `undefined` if it is no rate limit. `body`
 * is needed for GitHub's secondary limits, which may be a plain 403 that only says so.
 */
export function pauseUntil(response: Response, body = '', now = Date.now()): number | undefined {
	const header = (name: string) => {
		const value = Number(response.headers.get(name) ?? NaN);
		return Number.isFinite(value) ? value : undefined;
	};
	// the budget used up (GitHub also says so with a 200, for GraphQL)
	if (header('x-ratelimit-remaining') === 0) {
		const reset = header('x-ratelimit-reset');
		return reset !== undefined ? Math.max(reset * 1000, now) : now + DEFAULT_PAUSE_MS;
	}
	if (response.status !== 403 && response.status !== 429) return undefined;
	const retryAfter = header('retry-after');
	if (retryAfter !== undefined) return now + retryAfter * 1000;
	if (response.status === 429 || SECONDARY.test(body)) return now + DEFAULT_PAUSE_MS;
	return undefined;
}

const SECONDARY = /secondary rate limit|abuse detection/i;

/**
 * A `fetch` that notes rate limits it sees, and tells of them in the log. `paused()` is
 * the time until which nothing should be asked that can wait, if any.
 */
export function createRateLimits(now = () => Date.now()) {
	let until = 0;
	return {
		fetch: async (input: string | URL | Request, init?: RequestInit) => {
			const response = await globalThis.fetch(input, init);
			const body = response.status === 403 ? await response.clone().text() : '';
			const pause = pauseUntil(response, body, now());
			if (pause !== undefined && pause > until) {
				const host = new URL(input instanceof Request ? input.url : input).host;
				if (until <= now())
					console.warn(
						`[upstream] ${host} rate limited us (${response.status}); pausing background reads until ${new Date(pause).toISOString()}`
					);
				until = pause;
			}
			return response;
		},
		paused: () => (until > now() ? until : null)
	};
}
