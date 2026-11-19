import { describe, expect, it } from 'vitest';
import { duration } from './format.ts';

describe('duration', () => {
	it('says how long, to the unit that matters', () => {
		expect(duration(400)).toBe('0s');
		expect(duration(4_200)).toBe('4s');
		expect(duration(134_000)).toBe('2m 14s');
		expect(duration(3_780_000)).toBe('1h 3m');
	});
});
