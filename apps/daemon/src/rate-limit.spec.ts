import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimits, pauseUntil } from './rate-limit.ts';

const response = (status: number, headers: Record<string, string> = {}) =>
	new Response('{}', { status, headers });

describe('pauseUntil', () => {
	const now = 1_000_000;

	it('waits as long as the forge says', () => {
		expect(pauseUntil(response(403, { 'retry-after': '30' }), '', now)).toBe(now + 30_000);
		expect(pauseUntil(response(429, { 'retry-after': '5' }), '', now)).toBe(now + 5_000);
	});

	it('waits for a used-up budget to reset, even on a response that succeeded', () => {
		const used = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000' };
		expect(pauseUntil(response(403, used), '', now)).toBe(2_000_000);
		expect(pauseUntil(response(200, used), '', now)).toBe(2_000_000);
	});

	it('knows a secondary limit by what it says', () => {
		const body = 'You have exceeded a secondary rate limit.';
		expect(pauseUntil(response(403), body, now)).toBe(now + 60_000);
		expect(pauseUntil(response(429), '', now)).toBe(now + 60_000);
	});

	it('is nothing for answers and other refusals', () => {
		expect(pauseUntil(response(200, { 'x-ratelimit-remaining': '10' }), '', now)).toBeUndefined();
		expect(pauseUntil(response(403), 'Resource not accessible', now)).toBeUndefined();
		expect(pauseUntil(response(404), '', now)).toBeUndefined();
	});
});

describe('createRateLimits', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('pauses after a refusal, says so once, and resumes when the time is up', async () => {
		let now = 1_000_000;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal('fetch', async () => response(429, { 'retry-after': '10' }));
		const limits = createRateLimits(() => now);
		expect(limits.paused()).toBeNull();
		await limits.fetch('https://api.github.com/search/issues');
		await limits.fetch('https://api.github.com/search/issues');
		expect(limits.paused()).toBe(now + 10_000);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toContain('api.github.com');
		now += 10_000;
		expect(limits.paused()).toBeNull();
		warn.mockRestore();
	});
});
