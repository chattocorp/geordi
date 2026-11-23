import type { UsageLimit } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { charge, holdsFor, toneOf } from './limits.ts';

const limit = (
	name: string,
	usedPercent?: number,
	status: UsageLimit['status'] = 'ok'
): UsageLimit => ({
	name,
	minutes: name.startsWith('5h') ? 300 : 10_080,
	usedPercent,
	status
});

describe('holdsFor', () => {
	it('holds the account’s limits for every model', () => {
		expect(holdsFor(limit('5h'), undefined)).toBe(true);
		expect(holdsFor(limit('Week'), 'claude-sonnet-5-5')).toBe(true);
	});

	it('holds a model’s own limit only for that model', () => {
		expect(holdsFor(limit('Week (Opus)'), 'claude-opus-5-5')).toBe(true);
		expect(holdsFor(limit('Week (Opus)'), 'claude-sonnet-5-5')).toBe(false);
		expect(holdsFor(limit('Week (Opus)'), undefined)).toBe(false);
	});
});

describe('toneOf', () => {
	it('is low from 30% left, and nearly gone from 10%', () => {
		expect(toneOf(0.5)).toBe('normal');
		expect(toneOf(0.3)).toBe('warning');
		expect(toneOf(0.1)).toBe('danger');
	});

	it('goes by the whole percent shown', () => {
		expect(toneOf(1 - 0.7)).toBe('warning');
		expect(toneOf(0.304)).toBe('warning');
	});

	it('takes the provider’s word for it', () => {
		expect(toneOf(0.5, 'warning')).toBe('warning');
		expect(toneOf(undefined, 'limited')).toBe('danger');
	});
});

describe('charge', () => {
	it('is the shortest window that says how much is used', () => {
		const limits = [limit('5h', 20), limit('Week', 90, 'warning')];
		expect(charge(limits, undefined)).toEqual({ left: 0.8, tone: 'normal' });
	});

	it('is the weekly limits where the five-hour one says nothing', () => {
		expect(charge([limit('Week', 60)], undefined)).toEqual({ left: 0.4, tone: 'normal' });
		const limits = [limit('5h'), limit('Week', 60), limit('Week (Opus)', 70, 'warning')];
		expect(charge(limits, 'claude-opus-5-5')).toEqual({
			left: expect.closeTo(0.3),
			tone: 'warning'
		});
	});

	it('leaves out other models’ limits', () => {
		const limits = [limit('5h (GPT-X)', 90), limit('Week', 50)];
		expect(charge(limits, 'gpt-y')).toEqual({ left: 0.5, tone: 'normal' });
		expect(charge(limits, 'gpt-x')?.tone).toBe('danger');
	});

	it('is the least of limits whose length is unknown', () => {
		const limits = [
			{ name: 'Limit', usedPercent: 11, status: 'ok' as const },
			{ name: 'Other', usedPercent: 60, status: 'ok' as const }
		];
		expect(charge(limits, undefined)).toEqual({ left: 0.4, tone: 'normal' });
	});

	it('is empty once the shown limit is reached, said in a percentage or not', () => {
		expect(charge([limit('5h', undefined, 'limited'), limit('Week', 10)], undefined)).toEqual({
			left: 0,
			tone: 'danger'
		});
	});

	it('is unknown where no limit says how much is used', () => {
		expect(charge([], undefined)).toBeUndefined();
		expect(charge([limit('5h')], undefined)).toBeUndefined();
	});
});
