import { expect, it, vi } from 'vitest';
import { createUpstreamRefresh } from './upstream-refresh.ts';

it('checks immediately and routes one retry ten seconds after the latest answer', async () => {
	vi.useFakeTimers();
	try {
		const first = Promise.withResolvers<void>();
		const last = Promise.withResolvers<void>();
		const watched = vi
			.fn<() => Promise<void> | undefined>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(last.promise);
		const background = vi.fn(async () => {});
		const refresh = createUpstreamRefresh(watched, background);
		refresh('shared');
		refresh('shared');
		expect(watched).toHaveBeenCalledTimes(2);
		first.resolve();
		await vi.advanceTimersByTimeAsync(20_000);
		expect(background).not.toHaveBeenCalled();
		last.resolve();
		await vi.advanceTimersByTimeAsync(9_999);
		expect(watched).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(background).toHaveBeenCalledExactlyOnceWith('shared');
		await vi.advanceTimersByTimeAsync(10_000);
		expect(watched).toHaveBeenCalledTimes(3);
	} finally {
		vi.useRealTimers();
	}
});
