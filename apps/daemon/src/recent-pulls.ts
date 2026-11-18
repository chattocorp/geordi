import type { ForgeProvider, Thread } from 'forges';

type Repo = Parameters<ForgeProvider['threads']['list']>[0];

/** A repository's most recently updated pull requests, as last listed. */
export type Listing = {
	at: number;
	/** The forge's validator for the listing, where it has one. */
	etag?: string;
	threads: Thread[];
	/** The listing holds all of the repository's pull requests: one not in it does not exist. */
	complete: boolean;
};

/** How many of a repository's most recently updated pull requests are listed. */
const SIZE = 30;
/** How long a listing is reused where the forge cannot say that it is unchanged for free. */
const UNCONDITIONAL_MS = 60_000;

/**
 * Lists a repository's pull requests, the most recently updated first, for all of its
 * worktrees at once. Anything that happens to a pull request (a push, a review, a comment,
 * a merge) makes it the most recently updated, so this one request says which of them
 * changed. Asked again, it sends the listing's validator: GitHub answers `304 Not Modified`
 * when nothing changed, which costs nothing of the rate limit.
 */
export function createRecentPulls() {
	const listings = new Map<string, Listing>();
	const reading = new Map<string, Promise<Listing>>();

	async function list(provider: ForgeProvider, repo: Repo, key: string, now: number) {
		const known = listings.get(key);
		const page = await provider.threads
			.list(repo, {
				kind: 'pull_request',
				state: 'all',
				sort: 'updated',
				direction: 'desc',
				perPage: SIZE,
				...(known?.etag && { cursor: { etag: known.etag } })
			})
			.page();
		const listing: Listing =
			page.notModified && known
				? { ...known, at: now }
				: { at: now, etag: page.etag, threads: page.items, complete: !page.cursor };
		return listing;
	}

	/** The listing, at most `maxAge` old (longer where the forge has no validators). */
	return function recentPulls(
		provider: ForgeProvider,
		repo: Repo,
		maxAge: number,
		now = Date.now()
	): Promise<Listing> {
		const key = JSON.stringify([repo.forge, repo.instance, repo.owner, repo.name]);
		const known = listings.get(key);
		if (
			maxAge > 0 &&
			known &&
			now - known.at < (known.etag ? maxAge : Math.max(maxAge, UNCONDITIONAL_MS))
		)
			return Promise.resolve(known);
		let read = reading.get(key);
		// An explicit refresh must observe changes made after an in-flight read began.
		if (!read || maxAge === 0) {
			read = list(provider, repo, key, now)
				.then((listing) => {
					if (reading.get(key) === read) listings.set(key, listing);
					return listing;
				})
				.finally(() => {
					if (reading.get(key) === read) reading.delete(key);
				});
			reading.set(key, read);
		}
		return read;
	};
}
