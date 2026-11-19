import { describe, expect, it } from 'vitest';
import { describeUsage, fullness, tokenBreakdown, tokenSummary, tokens } from './tokens.ts';

describe('tokens', () => {
	const usage = {
		totalTokens: 150330,
		inputTokens: 8,
		outputTokens: 353,
		cachedReadTokens: 120465,
		cachedWriteTokens: 29504
	};

	it('says a reply’s tokens in short, and in full', () => {
		expect(tokenSummary(usage)).toBe('150k tokens');
		expect(tokenSummary({ totalTokens: 1234, inputTokens: 1224, outputTokens: 10 })).toBe(
			'1k tokens'
		);
		expect(tokenBreakdown(usage)).toBe(
			'8 input · 353 output · 120,465 cache read · 29,504 cache write'
		);
	});

	it('says token counts the way people do', () => {
		expect(tokens(812)).toBe('812');
		expect(tokens(31_432)).toBe('31k');
		expect(tokens(258_400)).toBe('258k');
		expect(tokens(1_000_000)).toBe('1M');
		expect(tokens(1_500_000)).toBe('1.5M');
	});

	it('describes how full the context is, with the cost where there is one', () => {
		expect(describeUsage({ used: 19_711, size: 258_400 })).toBe('20k of 258k tokens');
		expect(
			describeUsage({
				used: 31_432,
				size: 1_000_000,
				cost: { amount: 0.2673511, currency: 'USD' }
			})
		).toBe('31k of 1M tokens · $0.27');
	});

	it('keeps the share between nothing and all', () => {
		expect(fullness({ used: 250, size: 1000 })).toBe(0.25);
		expect(fullness({ used: 2000, size: 1000 })).toBe(1);
		expect(fullness({ used: 10, size: 0 })).toBe(0);
	});
});
