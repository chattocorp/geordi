import { describe, expect, it } from 'vitest';
import { turnUsage } from './acp.ts';

describe('turnUsage', () => {
	it("keeps ACP's standard counts and leaves out the wrapper's own", () => {
		expect(
			turnUsage({
				inputTokens: 8,
				outputTokens: 353,
				cachedReadTokens: 120465,
				cachedWriteTokens: 29504,
				thoughtTokens: 0,
				totalTokens: 150330,
				_meta: { quota: { model_usage: [] } }
			})
		).toEqual({
			usage: {
				inputTokens: 8,
				outputTokens: 353,
				cachedReadTokens: 120465,
				cachedWriteTokens: 29504,
				totalTokens: 150330
			}
		});
	});

	it('says nothing when nothing was reported', () => {
		expect(turnUsage(undefined)).toEqual({});
		expect(turnUsage(null)).toEqual({});
		expect(turnUsage({ totalTokens: 0, inputTokens: 0, outputTokens: 0 })).toEqual({});
	});
});
