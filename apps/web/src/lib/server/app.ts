import { join } from 'node:path';
import { GEORDI_DAEMON_PORT, GEORDI_DATA_DIR } from '$app/env/private';
import { store } from './events/index.ts';
import { loadDaemonToken } from './daemon-token.ts';
import { createHub } from './daemons.ts';
import { createIssues } from './issues.ts';
import { lazy } from './lazy.ts';
import { createRepos } from './repos.ts';
import { createTerminals } from './terminals.ts';
import { createWorkspaces } from './workspaces.ts';

/** The forge's services, wired together. Everything is created on first use. */

export const issues = lazy(() => createIssues(store()));
export const repos = lazy(() => createRepos(store()));
export const workspaces = lazy(() =>
	createWorkspaces(store(), repos(), (message) => hub().send(message))
);
export const terminals = lazy(() =>
	createTerminals(
		(message) => hub().send(message),
		(id) => workspaces().ref(id)
	)
);

export const hub = lazy(() =>
	createHub(GEORDI_DAEMON_PORT, loadDaemonToken(join(GEORDI_DATA_DIR, 'daemon-token')), {
		onHello: (_daemonId, running) => {
			workspaces().reconcile(running);
			terminals().reset();
		},
		onMessage: (message) => {
			if (message.type === 'session.event') workspaces().record(message.sessionId, message.event);
			else if (message.type === 'terminal.output')
				terminals().output(message.workspaceId, message.data);
			else if (message.type === 'terminal.exit') terminals().exit(message.workspaceId);
		}
	})
);
