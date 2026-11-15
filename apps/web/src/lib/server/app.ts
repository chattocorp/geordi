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
import { webUrl } from '../url.ts';
import { createWatchers, type WorktreeState } from './watchers.ts';
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

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Asks a daemon how a worktree's files and branch stand. Never rejects. */
async function loadWorktreeState(worktreeId: string): Promise<WorktreeState> {
	const state: WorktreeState = { changes: null, unavailable: null, upstream: null };
	let ref;
	try {
		ref = workspaces().ref(worktreeId);
	} catch (error) {
		return { ...state, unavailable: reason(error) };
	}

	const [changes, upstream] = await Promise.allSettled([
		hub().request({ kind: 'changes', ...ref }),
		hub().request({ kind: 'upstream', ...ref })
	]);
	if (changes.status === 'fulfilled') state.changes = changes.value;
	else state.unavailable = reason(changes.reason);

	if (upstream.status === 'fulfilled' && upstream.value) {
		// These end up in links. They come from a daemon and, before that, another forge.
		const { pull } = upstream.value;
		state.upstream = {
			...upstream.value,
			repoUrl: webUrl(upstream.value.repoUrl),
			createUrl: webUrl(upstream.value.createUrl),
			pull: pull && {
				...pull,
				url: webUrl(pull.url),
				checks: pull.checks && { ...pull.checks, url: webUrl(pull.checks.url) }
			}
		};
	}
	return state;
}

export const watchers = lazy(() =>
	createWatchers(
		(message) => hub().send(message),
		(id) => workspaces().ref(id),
		loadWorktreeState
	)
);

export const hub = lazy(() =>
	createHub(GEORDI_DAEMON_PORT, loadSecret(join(GEORDI_DATA_DIR, 'daemon-token')), {
		onHello: (_daemonId, running, runningTerminals) => {
			workspaces().reconcile(running);
			terminals().reconcile(runningTerminals);
			watchers().resync();
		},
		onMessage: (message) => {
			if (message.type === 'workspace.event')
				workspaces().record(message.workspaceId, message.event);
			else if (message.type === 'terminal.output')
				terminals().output(message.terminalId, message.data, message.offset);
			else if (message.type === 'terminal.exit') terminals().exit(message.terminalId);
			else if (message.type === 'worktree.changed') watchers().changed(message.worktreeId);
		}
	})
);
