import { expect, it, vi } from 'vitest';
import { createLimits } from './limits.ts';

it('keeps the latest limits per agent, and tells only of changes', () => {
	const limits = createLimits();
	const changed = vi.fn();
	limits.subscribe(changed);
	const week = { name: 'Week', usedPercent: 45, status: 'ok' as const };

	limits.note('codex', [week]);
	limits.note('codex', [{ ...week }]);
	expect(changed).toHaveBeenCalledTimes(1);

	limits.note('claude', [{ name: '5h', usedPercent: 11, status: 'ok' }]);
	limits.note('codex', [{ ...week, usedPercent: 46 }]);
	expect(changed).toHaveBeenCalledTimes(3);
	expect(limits.read()).toEqual({
		codex: [{ ...week, usedPercent: 46 }],
		claude: [{ name: '5h', usedPercent: 11, status: 'ok' }]
	});
});

it('passes over limits said earlier than those it knows', () => {
	const limits = createLimits();
	const now = [{ name: '5h', usedPercent: 60, status: 'ok' as const }];
	limits.note('claude', now, 2_000);
	limits.note('claude', [{ name: '5h', usedPercent: 10, status: 'ok' }], 1_000);
	expect(limits.read().claude).toEqual(now);
});

it('leaves out limits once they reset, and tells of it then', () => {
	vi.useFakeTimers({ now: 0 });
	try {
		const limits = createLimits();
		const changed = vi.fn();
		limits.subscribe(changed);
		const week = { name: 'Week', usedPercent: 40, resetsAt: 10_000, status: 'ok' as const };
		const hours = { name: '5h', usedPercent: 70, resetsAt: 1_000, status: 'ok' as const };
		limits.note('claude', [hours, week]);
		expect(changed).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1_000);
		expect(changed).toHaveBeenCalledTimes(2);
		expect(limits.read()).toEqual({ claude: [week] });

		vi.advanceTimersByTime(9_000);
		expect(changed).toHaveBeenCalledTimes(3);
		expect(limits.read()).toEqual({});
	} finally {
		vi.useRealTimers();
	}
});
