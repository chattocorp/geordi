import { join } from 'node:path';
import { GEORDI_DAEMON_PORT, GEORDI_DATA_DIR } from '$app/env/private';
import { store } from './events/index.ts';
import { loadDaemonToken } from './daemon-token.ts';
import { createHub } from './daemons.ts';
import { createIssues } from './issues.ts';
import { lazy } from './lazy.ts';
import { createRepos } from './repos.ts';
import { createSessions } from './sessions.ts';

/** The forge's services, wired together. Everything is created on first use. */

export const issues = lazy(() => createIssues(store()));
export const repos = lazy(() => createRepos(store()));
export const sessions = lazy(() =>
	createSessions(store(), repos(), (message) => hub().send(message))
);

export const hub = lazy(() =>
	createHub(GEORDI_DAEMON_PORT, loadDaemonToken(join(GEORDI_DATA_DIR, 'daemon-token')), {
		onHello: (_daemonId, running) => sessions().reconcile(running),
		onMessage: (message) => {
			if (message.type === 'session.event') sessions().record(message.sessionId, message.event);
		}
	})
);
