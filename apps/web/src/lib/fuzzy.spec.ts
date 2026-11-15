import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch, fuzzySegments } from './fuzzy.ts';

describe('fuzzyMatch', () => {
	it('finds the characters in order, wherever they are', () => {
		expect(fuzzyMatch('g6l', 'GPT-6-Luna')?.indices).toEqual([0, 4, 6]);
		expect(fuzzyMatch('son', 'Sonnet')?.indices).toEqual([0, 1, 2]);
		expect(fuzzyMatch('nos', 'Sonnet')).toBeNull();
		expect(fuzzyMatch('sonnets', 'Sonnet')).toBeNull();
	});

	it('matches everything with nothing to look for, and ignores case and spaces', () => {
		expect(fuzzyMatch('', 'Opus')).toEqual({ score: 0, indices: [] });
		expect(fuzzyMatch(' EX hi', 'Extra high')?.indices).toEqual([0, 1, 6, 7]);
	});

	it('prefers the start of a word to the middle of one', () => {
		// the "l" of "Luna", not the one in "Sol"
		expect(fuzzyMatch('l', 'Sol Luna')?.indices).toEqual([4]);
	});
});

describe('fuzzyFilter', () => {
	const models = ['GPT-6.1-Sol', 'GPT-6-Astra', 'GPT-6-Sol', 'GPT-6-Luna', 'Daybreak Blue'];
	const find = (query: string) => fuzzyFilter(query, models, (m) => m).map(({ item }) => item);

	it('keeps the order while there is nothing to look for', () => {
		expect(find('')).toEqual(models);
	});

	it('puts the best match first', () => {
		expect(find('luna')).toEqual(['GPT-6-Luna']);
		expect(find('sol')).toEqual(['GPT-6.1-Sol', 'GPT-6-Sol']);
		expect(find('db')).toEqual(['Daybreak Blue']);
		expect(find('zzz')).toEqual([]);
	});

	it('also finds things by another name, after those found by their own', () => {
		const items = [
			{ name: 'Opus', id: 'claude-opus' },
			{ name: 'Claude', id: 'x' }
		];
		const found = fuzzyFilter(
			'claude',
			items,
			(i) => i.name,
			(i) => i.id
		);
		expect(found.map(({ item }) => item.name)).toEqual(['Claude', 'Opus']);
		expect(found[1].indices).toEqual([]);
	});
});

describe('fuzzySegments', () => {
	it('cuts the text into matched and unmatched runs', () => {
		expect(fuzzySegments('Sonnet', [0, 1, 4])).toEqual([
			{ text: 'So', hit: true },
			{ text: 'nn', hit: false },
			{ text: 'e', hit: true },
			{ text: 't', hit: false }
		]);
		expect(fuzzySegments('Opus', [])).toEqual([{ text: 'Opus', hit: false }]);
	});
});
