import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GEORDI_DATA_DIR } from '$app/env/private';
import type { IssueEvent } from '../issues.ts';
import { lazy } from '../lazy.ts';
import type { RepoEvent } from '../repos.ts';
import type { WorkspacesEvent } from '../workspaces.ts';
import { EventStore } from './store.ts';

export { EventStore, type EventInput, type StoredEvent } from './store.ts';

/** Every event Geordi knows about. Add each domain's event union here. */
export type GeordiEvent = IssueEvent | RepoEvent | WorkspacesEvent;

/** The application's event store. Created lazily so builds don't touch the data directory. */
export const store = lazy(() => {
	mkdirSync(GEORDI_DATA_DIR, { recursive: true });
	return new EventStore<GeordiEvent>(join(GEORDI_DATA_DIR, 'events.db'));
});
