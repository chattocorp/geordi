import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GEORDI_DATA_DIR } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import type { LegacyEvent } from '../legacy.ts';
import { lazy } from '../lazy.ts';
import type { RepoEvent } from '../repos.ts';
import type { WorkspacesEvent } from '../workspaces.ts';
import { EventStore } from './store.ts';

export { EventStore, type EventInput, type StoredEvent } from './store.ts';

/** Every event Geordi knows about. Add each domain's event union here. */
export type GeordiEvent = RepoEvent | WorkspacesEvent | LegacyEvent;

/** The application's event store. Created lazily so builds don't touch the data directory. */
export const store = lazy(() => {
	mkdirSync(GEORDI_DATA_DIR, { recursive: true });
	return new EventStore<GeordiEvent>(join(GEORDI_DATA_DIR, 'events.db'));
});

/**
 * The body of a `query.live`: `read()` now, and again after every event (or whenever `also`
 * says so; see `EventStore.live`). Ends when the request does, so that nothing is held for
 * a browser that has gone.
 */
export function live<T>(read: () => T, also?: (changed: () => void) => () => void) {
	let signal: AbortSignal | undefined;
	try {
		signal = getRequestEvent().request.signal;
	} catch {
		// not in a request (a test, say): it ends when its reader says so
	}
	return store().live(read, also, signal);
}
