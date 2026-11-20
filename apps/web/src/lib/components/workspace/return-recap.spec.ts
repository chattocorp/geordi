import { afterEach, expect, it, vi } from 'vitest';
import { watchReturn } from './return-recap.ts';

afterEach(() => vi.unstubAllGlobals());

it('recaps only the unseen interval and reuses the result after navigating away or refocusing', async () => {
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
	let seq = 2;
	const first = Promise.withResolvers<string>();
	const generate = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('New question');
	const show = vi.fn();
	const open = () => watchReturn('one', () => seq, generate, show);
	let visit = open();
	seq = 5;
	visit.update();
	expect(generate).not.toHaveBeenCalled();
	focused = false;
	tab.dispatchEvent(new Event('blur'));
	seq = 7;
	visit.update();
	focused = true;
	tab.dispatchEvent(new Event('focus'));
	expect(generate).toHaveBeenCalledExactlyOnceWith(5, 7);
	visit.destroy();
	first.resolve('Tests passed.');
	await first.promise;
	visit = open();
	expect(show).toHaveBeenLastCalledWith('Tests passed.');
	expect(generate).toHaveBeenCalledTimes(1);
	visit.destroy();
	seq = 9;
	visit = open();
	expect(generate).toHaveBeenLastCalledWith(7, 9);
	expect(generate).toHaveBeenCalledTimes(2);
	visit.destroy();
});
