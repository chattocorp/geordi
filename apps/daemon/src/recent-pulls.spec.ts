import { github } from 'forges';
import { expect, it, vi } from 'vitest';
import { createRecentPulls } from './recent-pulls.ts';

it('starts a new listing for a fresh read and ignores an older listing that arrives last', async () => {
	const older = Promise.withResolvers<Response>();
	const started = Promise.withResolvers<void>();
	const fetch = vi.fn(async () => Response.json([], { headers: { etag: 'new' } }));
	fetch.mockImplementationOnce(() => {
		started.resolve();
		return older.promise;
	});
	const provider = github({ fetch });
	const repo = { forge: 'github', instance: 'github.com', owner: 'acme', name: 'widgets' };
	const read = createRecentPulls();
	const first = read(provider, repo, 10_000, 100);
	await started.promise;
	const fresh = await read(provider, repo, 0, 101);
	expect(fresh.etag).toBe('new');
	older.resolve(Response.json([], { headers: { etag: 'old' } }));
	expect((await first).etag).toBe('old');
	expect(await read(provider, repo, 10_000, 102)).toBe(fresh);
	expect(fetch).toHaveBeenCalledTimes(2);
});
