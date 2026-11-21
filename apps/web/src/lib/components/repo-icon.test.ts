import { describe, expect, it } from 'vitest';
import { isDarkMark } from './repo-icon.ts';

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
