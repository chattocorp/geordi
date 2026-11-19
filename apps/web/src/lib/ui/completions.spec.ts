import { describe, expect, it } from 'vitest';
import { completionQuery, matching } from '@geordi/ui/completions';

describe('completions', () => {
	it('are asked for by a slash and a word at the start, and nothing else', () => {
		expect(completionQuery('/')).toBe('');
		expect(completionQuery('/rev')).toBe('rev');
		expect(completionQuery('/review ')).toBeNull();
		expect(completionQuery('/review the tests')).toBeNull();
		expect(completionQuery('please /review')).toBeNull();
		expect(completionQuery('')).toBeNull();
	});

	it('match what begins with the query first, then a word of it, then what contains it', () => {
		const offered = [
			{ text: '/compact' },
			{ text: '/code-review' },
			{ text: '/review' },
			{ text: '/$review-agent' },
			{ text: '/status' },
			{ text: '/ultrareview' }
		];
		expect(matching(offered, 'rev').map((c) => c.text)).toEqual([
			'/review',
			'/$review-agent',
			'/code-review',
			'/ultrareview'
		]);
		expect(matching(offered, 'COM')).toEqual([{ text: '/compact' }]);
		expect(matching(offered, '$rev').map((c) => c.text)).toEqual([
			'/review',
			'/$review-agent',
			'/code-review',
			'/ultrareview'
		]);
		expect(matching(offered, '')).toEqual(offered);
	});
});
