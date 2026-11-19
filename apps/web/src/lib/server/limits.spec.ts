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
