import { expect, it } from 'vitest';
import { EventStore } from './events/store.ts';
import type { GeordiEvent } from './events/index.ts';
import { createOpenIn } from './open-in.ts';

it('replays the ordered list and refuses to overwrite a concurrent edit', () => {
	const store = new EventStore<GeordiEvent>(':memory:');
	const settings = createOpenIn(store);
	const initial = settings.get();
	const apps = ['Finder', 'Zed'].map((name, i) => ({
		name,
		id: String(i),
		enabled: !!i,
		command: 'open .'
	}));
	settings.save({ ...initial, apps });
	expect(() => settings.save(initial)).toThrow();
	expect(createOpenIn(store).get().apps).toEqual(apps);
});
