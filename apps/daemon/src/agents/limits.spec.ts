import { expect, it } from 'vitest';
import { limitsIn } from './limits.ts';

it("reads Claude's windows from its rate limit event", () => {
	expect(
		limitsIn({
			'_claude/rateLimit': {
				status: 'allowed_warning',
				rateLimitType: 'seven_day',
				utilization: 0.77,
				unifiedWindows: {
					five_hour: { utilization: 0.15, resetsAt: 1795106400, status: 'allowed' },
					seven_day: { utilization: 0.77, resetsAt: 1795363200, status: 'allowed_warning' },
					seven_day_opus: { utilization: 1, status: 'rejected' },
					nonsense: 'yes'
				}
			}
		})
	).toEqual([
		{ name: '5h', minutes: 300, usedPercent: 15, resetsAt: 1795106400000, status: 'ok' },
		{ name: 'Week', minutes: 10080, usedPercent: 77, resetsAt: 1795363200000, status: 'warning' },
		{ name: 'Week (Opus)', minutes: 10080, usedPercent: 100, status: 'limited' }
	]);
});

it("reads Codex's snapshots, windows by their length", () => {
	const snapshot = {
		limitId: 'codex',
		limitName: null,
		primary: { usedPercent: 45, windowDurationMins: 300, resetsAt: 1795506444 },
		secondary: { usedPercent: 90, windowDurationMins: 10080, resetsAt: 1795506444 },
		rateLimitReachedType: null
	};
	expect(limitsIn({ 'codex/rateLimits': [snapshot] })).toEqual([
		{ name: '5h', minutes: 300, usedPercent: 45, resetsAt: 1795506444000, status: 'ok' },
		{ name: 'Week', minutes: 10080, usedPercent: 90, resetsAt: 1795506444000, status: 'warning' }
	]);
	expect(
		limitsIn({
			'codex/rateLimits': [
				{ ...snapshot, limitName: 'GPT-X', secondary: null, rateLimitReachedType: 'primary' }
			]
		})
	).toEqual([
		{
			name: '5h (GPT-X)',
			minutes: 300,
			usedPercent: 45,
			resetsAt: 1795506444000,
			status: 'limited'
		}
	]);
});

it('finds nothing where there is nothing it knows', () => {
	expect(limitsIn(undefined)).toBeUndefined();
	expect(limitsIn({ '_claude/model': 'opus' })).toBeUndefined();
	expect(limitsIn({ '_claude/rateLimit': { status: 'allowed' } })).toBeUndefined();
	expect(limitsIn({ 'codex/rateLimits': 'nope' })).toBeUndefined();
});
