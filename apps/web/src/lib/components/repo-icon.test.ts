import { describe, expect, it } from 'vitest';
import { isDarkMark } from '@geordi/ui/picture';
import { monogram, tint } from './repo-icon.ts';

/** `count` pixels of one colour, then transparent ones up to `total`. */
function pixels(rgba: number[], count: number, total = 100) {
	return Array.from({ length: total }, (_, i) => (i < count ? rgba : [0, 0, 0, 0])).flat();
}

describe('isDarkMark', () => {
	it('plates a black glyph on nothing', () => {
		expect(isDarkMark(pixels([0, 0, 0, 255], 30))).toBe(true);
	});
	it('leaves a dark tile that brings its own background', () => {
		expect(isDarkMark(pixels([44, 47, 59, 255], 80))).toBe(false);
	});
	it('leaves a light or coloured glyph', () => {
		expect(isDarkMark(pixels([255, 255, 255, 255], 30))).toBe(false);
		expect(isDarkMark(pixels([245, 176, 33, 255], 30))).toBe(false);
	});
	it('leaves an empty picture', () => {
		expect(isDarkMark(pixels([0, 0, 0, 0], 0))).toBe(false);
	});
});

describe('monogram', () => {
	it('takes the first letter of the name, without its owner', () => {
		expect(monogram('geordi')).toBe('G');
		expect(monogram('hmans/geordi')).toBe('G');
	});
	it('skips what is not a letter or digit', () => {
		expect(monogram('.dotfiles')).toBe('D');
		expect(monogram('_9lives')).toBe('9');
	});
	it('has something for a name with nothing to take', () => {
		expect(monogram('---')).toBe('?');
	});
});

describe('tint', () => {
	it('is the same for the same repository', () => {
		expect(tint('repo-1')).toBe(tint('repo-1'));
	});
	it('is one of the six', () => {
		for (let i = 0; i < 100; i++) expect(tint(`repo-${i}`)).toBeOneOf([0, 1, 2, 3, 4, 5]);
	});
	it('spreads repositories over all of them', () => {
		const used = new Set(Array.from({ length: 50 }, (_, i) => tint(`repo-${i}`)));
		expect(used.size).toBe(6);
	});
});
