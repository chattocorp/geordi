import type { UsageLimit } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { charge, holdsFor, toneOf } from './limits.ts';

const limit = (
	name: string,
	usedPercent?: number,
	status: UsageLimit['status'] = 'ok'
): UsageLimit => ({ name, usedPercent, status });

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
	it('is the least that the limits leave', () => {
		expect(charge([limit('5h', 11), limit('Week', 60)], undefined)).toEqual({
			left: 0.4,
			tone: 'normal'
		});
	});

	it('stands as the worst of its limits', () => {
		const limits = [limit('5h', 10), limit('Week', 50, 'warning')];
		expect(charge(limits, undefined)?.tone).toBe('warning');
	});

	it('leaves out other models’ limits', () => {
		const limits = [limit('5h', 10), limit('Week (Opus)', 95)];
		expect(charge(limits, 'claude-sonnet-5-5')).toEqual({ left: 0.9, tone: 'normal' });
		expect(charge(limits, 'claude-opus-5-5')?.tone).toBe('danger');
	});

	it('is empty once a limit is reached, said in a percentage or not', () => {
		const limits = [limit('5h', 10), limit('Week', undefined, 'limited')];
		expect(charge(limits, undefined)).toEqual({ left: 0, tone: 'danger' });
	});

	it('is unknown where no limit says how much is used', () => {
		expect(charge([], undefined)).toBeUndefined();
		expect(charge([limit('5h')], undefined)).toBeUndefined();
	});
});
