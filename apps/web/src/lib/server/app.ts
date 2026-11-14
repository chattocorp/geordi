import { join } from 'node:path';
import {
	GEORDI_AGENT_MAX_CHILDREN,
	GEORDI_AGENT_MAX_DEPTH,
	GEORDI_DAEMON_PORT,
	GEORDI_DATA_DIR
} from '$app/env/private';
import { store } from './events/index.ts';
import { loadSecret } from './secret.ts';
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
	createWorkspaces(store(), repos(), (message) => hub().send(message), {
		limits: { depth: GEORDI_AGENT_MAX_DEPTH, children: GEORDI_AGENT_MAX_CHILDREN },
		secret: loadSecret(join(GEORDI_DATA_DIR, 'agent-api-secret'))
	})
);
export const terminals = lazy(() =>
	createTerminals(
		(message) => hub().send(message),
		(terminalId) => hub().request({ kind: 'scrollback', terminalId }),
		(id) => workspaces().ref(id)
	)
);

export const hub = lazy(() =>
	createHub(GEORDI_DAEMON_PORT, loadSecret(join(GEORDI_DATA_DIR, 'daemon-token')), {
		onHello: (_daemonId, running, runningTerminals) => {
			workspaces().reconcile(running);
			terminals().reconcile(runningTerminals);
		},
		onMessage: (message) => {
			if (message.type === 'session.event') workspaces().record(message.sessionId, message.event);
			else if (message.type === 'terminal.output')
				terminals().output(message.terminalId, message.data, message.offset);
			else if (message.type === 'terminal.exit') terminals().exit(message.terminalId);
		}
	})
);
