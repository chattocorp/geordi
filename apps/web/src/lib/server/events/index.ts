import type { DaemonEvent } from '../daemons.ts';
import type { AccessEvent } from '../agent-access.ts';
import type { ImageEvent } from '../images.ts';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GEORDI_DATA_DIR } from '$app/env/private';
import type { LegacyEvent } from '../legacy.ts';
import { lazy } from '../lazy.ts';
import type { RepoEvent } from '../repos.ts';
import type { WorkspacesEvent } from '../workspace-projection.ts';
import { EventStore } from './store.ts';

export { EventStore, type EventInput, type StoredEvent } from './store.ts';

/** Every event Geordi knows about. Add each domain's event union here. */
export type GeordiEvent =
	DaemonEvent | RepoEvent | WorkspacesEvent | LegacyEvent | ImageEvent | AccessEvent;

/** The application's event store. Created lazily so builds don't touch the data directory. */
export const store = lazy(() => {
	mkdirSync(GEORDI_DATA_DIR, { recursive: true });
	return new EventStore<GeordiEvent>(join(GEORDI_DATA_DIR, 'events.db'));
});
