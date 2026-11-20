import { afterEach, expect, it, vi } from 'vitest';
import { watchReturn } from './return-recap.ts';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('generates only after five minutes away with an unseen turn end or question', async () => {
	vi.useFakeTimers();
	let focused = true;
	const tab = new EventTarget();
	vi.stubGlobal('window', tab);
	vi.stubGlobal(
		'document',
		Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => focused })
	);
	const values = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key),
		setItem: (key: string, value: string) => values.set(key, value)
	});
	let through = 2,
		trigger = 2;
	const generate = vi.fn().mockResolvedValue('Ready for review.');
	const show = vi.fn();
	const open = () => watchReturn('one', () => ({ through, trigger }), generate, show);
	let visit = open();
	const leave = () => {
		focused = false;
		tab.dispatchEvent(new Event('blur'));
	};
	const back = () => {
		focused = true;
		tab.dispatchEvent(new Event('focus'));
	};
	vi.advanceTimersByTime(600_000); // Reading an idle workspace is time present.
	leave();
	through = trigger = 4;
	vi.advanceTimersByTime(299_999);
	back();
	expect(generate).not.toHaveBeenCalled();
	leave();
	through = 6; // Only tools changed.
	vi.advanceTimersByTime(300_000);
	back();
	expect(generate).not.toHaveBeenCalled();
	leave();
	through = trigger = 7;
	vi.advanceTimersByTime(120_000);
	visit.destroy(); // Leaving a background window must preserve its original departure.
	vi.advanceTimersByTime(180_000);
	focused = true;
	visit = open();
	expect(generate).toHaveBeenCalledExactlyOnceWith(6, 7);
	await Promise.resolve();
	visit.destroy();
	visit = open();
	expect(show).toHaveBeenLastCalledWith('Ready for review.');
	expect(generate).toHaveBeenCalledTimes(1);
	visit.destroy();
});
