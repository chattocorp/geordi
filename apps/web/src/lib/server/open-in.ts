import { error } from '@sveltejs/kit';
import type { OpenInApp, OpenInSettings } from '../open-in.ts';
import type { EventStore, GeordiEvent } from './events/index.ts';

export type OpenInEvent = {
	type: 'settings.openIn';
	stream: 'settings:open-in';
	data: { id: 'open-in'; apps: OpenInApp[] };
};

export function createOpenIn(store: EventStore<GeordiEvent>) {
	const settings = store.project<OpenInSettings>(
		'open-in',
		() => ({ revision: 0, apps: [] }),
		(state, event) =>
			event.type === 'settings.openIn' ? { revision: event.seq, apps: event.data.apps } : state,
		['settings']
	);
	return {
		get: settings.get,
		save({ revision, apps }: OpenInSettings) {
			if (settings.get().revision !== revision)
				error(
					409,
					'Settings changed in another window. Discard your edits to load the latest list.'
				);
			if (new Set(apps.map((app) => app.id)).size !== apps.length)
				error(400, 'Each app needs a unique ID');
			store.append({
				type: 'settings.openIn',
				stream: 'settings:open-in',
				data: { id: 'open-in', apps }
			});
		}
	};
}
