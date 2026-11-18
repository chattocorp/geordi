import { describe, expect, it } from 'vitest';
import { tokenBreakdown, tokenSummary } from './tokens.ts';

describe('tokens', () => {
	const usage = {
		totalTokens: 150330,
		inputTokens: 8,
		outputTokens: 353,
		cachedReadTokens: 120465,
		cachedWriteTokens: 29504
	};

	it('says a reply’s tokens in short, and in full', () => {
		expect(tokenSummary(usage)).toBe('150K tokens');
		expect(tokenSummary({ totalTokens: 1234, inputTokens: 1224, outputTokens: 10 })).toBe(
			'1.2K tokens'
		);
		expect(tokenBreakdown(usage)).toBe(
			'8 input · 353 output · 120,465 cache read · 29,504 cache write'
		);
	});
});
