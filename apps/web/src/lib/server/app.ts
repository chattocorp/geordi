import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { NO_WORKTREE } from '@geordi/protocol';
import {
	GEORDI_AGENT_MAX_CHILDREN,
	GEORDI_AGENT_MAX_DEPTH,
	GEORDI_DAEMON_PORT,
	GEORDI_DATA_DIR
} from '$app/env/private';
import { archiveConcerns, type Standing } from '../archiving.ts';
import { createArchiver } from './archive.ts';
import { store } from './events/index.ts';
import { loadSecret } from './secret.ts';
import { createHub } from './daemons.ts';
import { createJobs } from './jobs.ts';
import { lazy } from './lazy.ts';
import { createRepos } from './repos.ts';
import { createTerminals } from './terminals.ts';
import { webUrl } from '../url.ts';
import { createWatchers, type WorktreeState } from './watchers.ts';
import { createWorkspaces } from './workspaces.ts';

/** The forge's services, wired together. Everything is created on first use. */

export const repos = lazy(() => createRepos(store()));
export const workspaces = lazy(() =>
	createWorkspaces(store(), repos(), (message) => hub().send(message), {
		limits: { depth: GEORDI_AGENT_MAX_DEPTH, children: GEORDI_AGENT_MAX_CHILDREN },
		secret: loadSecret(join(GEORDI_DATA_DIR, 'agent-api-secret')),
		// A workspace starts out named after the first line of its first message. A daemon
		// can do better (it asks a model); if it can't, the name simply stays.
		onCreated: (id, prompt) =>
			hub()
				.request({ kind: 'title', text: prompt }, 60_000)
				.then(
					(title) => workspaces().suggestTitle(id, title),
					(problem) => console.warn(`[titles] ${reason(problem)}`)
				)
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
async function loadWorktreeState(worktreeId: string, fresh = false): Promise<WorktreeState> {
	const state: WorktreeState = {
		changes: null,
		unavailable: null,
		missing: false,
		upstream: null,
		config: null
	};
	let ref;
	try {
		ref = workspaces().ref(worktreeId);
	} catch (error) {
		return { ...state, unavailable: reason(error) };
	}

	const [changes, upstream, config] = await Promise.allSettled([
		hub().request({ kind: 'changes', ...ref }),
		hub().request({ kind: 'upstream', fresh, ...ref }),
		hub().request({ kind: 'config', ...ref })
	]);
	if (config.status === 'fulfilled') state.config = config.value;
	if (changes.status === 'fulfilled') state.changes = changes.value;
	else {
		state.unavailable = reason(changes.reason);
		state.missing = state.unavailable === NO_WORKTREE;
	}

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

/**
 * Has a daemon make sure a workspace's worktree is there, and notes where it is: for a
 * workspace that has had no turn to make one in, or whose worktree went missing.
 */
export async function prepareWorktree(id: string) {
	const { path, branch } = await hub().request(
		{ kind: 'prepareWorktree', ...workspaces().ref(id) },
		90_000
	);
	// as a daemon says when it makes one for a turn (it goes to whoever owns the worktree)
	workspaces().record(id, { kind: 'worktree', path, branch });
	watchers().changed(workspaces().ref(id).worktreeId);
}

/**
 * Has a workspace carry on with new work (FDR-001): a daemon fetches and moves its worktree
 * to a new branch off where work in the repository starts; the conversation goes on, and
 * its agent hears of it with its next message.
 */
export async function continueWorkspace(id: string, actor: string | null = null) {
	const workspace = workspaces().summary(id);
	if (workspace.archivedAt) error(409, 'This workspace is archived');
	if (!workspace.worktree) error(409, 'This workspace has no worktree yet');
	// everyone in that directory is moved along: none of them may be in the middle of something
	const busy = workspaces()
		.sharing(id)
		.find((other) => other.status === 'running');
	if (busy) error(409, `Stop the agent in “${busy.title}” first`);

	let branch;
	try {
		({ branch } = await hub().request(
			{ kind: 'continueWorktree', ...workspaces().ref(id) },
			90_000
		));
	} catch (cause) {
		error(422, cause instanceof Error ? cause.message : String(cause));
	}
	workspaces().continued(id, branch, actor);
	watchers().changed(workspace.worktreeId, true);
}

/** Has a workspace's worktree looked at afresh, including how it stands upstream. */
function upstreamMayHaveChanged(workspaceId: string) {
	try {
		watchers().changed(workspaces().ref(workspaceId).worktreeId, true);
	} catch {
		// no such workspace (any more): nobody to tell
	}
}

/** The jobs repositories have run for their workspaces (FDR-006). */
export const jobs = lazy(() =>
	createJobs(
		terminals(),
		(request, timeoutMs) => hub().request(request, timeoutMs),
		(id) => workspaces().ref(id)
	)
);

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
			if (message.type === 'workspace.event') {
				workspaces().record(message.workspaceId, message.event, message.turn);
				// At the end of a turn, how things stand upstream may be different: agents push,
				// open pull requests, answer reviews. None of that shows in the worktree.
				if (message.event.kind === 'turn.completed' || message.event.kind === 'turn.failed')
					upstreamMayHaveChanged(message.workspaceId);
			} else if (message.type === 'terminal.output')
				terminals().output(message.terminalId, message.data, message.offset);
			else if (message.type === 'terminal.exit') terminals().exit(message.terminalId);
			else if (message.type === 'worktree.changed') watchers().changed(message.worktreeId);
		}
	})
);

/** How long the forge a repository is on gets to say how a pull request stands, before we ask without it. */
const UPSTREAM_PATIENCE_MS = 400;

/**
 * How a worktree stands, for someone about to archive it, and quickly: they are waiting
 * for a question. What a viewer already has loaded is taken as it is; otherwise the daemon
 * says what changed (which it knows at once), and how the pull request stands only if the
 * forge it is on answers in time.
 */
async function standingFor(worktreeId: string): Promise<Standing> {
	const watched = watchers().state(worktreeId);
	if (watched?.changes) return watched;
	let ref;
	try {
		ref = workspaces().ref(worktreeId);
	} catch {
		return { changes: null };
	}
	const late = new Promise<undefined>((resolve) => setTimeout(resolve, UPSTREAM_PATIENCE_MS));
	const [changes, upstream] = await Promise.all([
		hub()
			.request({ kind: 'changes', ...ref })
			.catch(() => null),
		Promise.race([hub().request({ kind: 'upstream', ...ref }), late]).catch(() => undefined)
	]);
	return { changes, upstream };
}

/**
 * What is unfinished about a workspace and the workspaces its agent started, for someone
 * about to archive it (see `archiveConcerns`). Says nothing where no daemon answers.
 */
export async function concernsAboutArchiving(id: string): Promise<string[]> {
	const family = [id, ...workspaces().descendants(id)].map(workspaces().summary);
	// each worktree once: a workspace that works in another's has no work of its own to lose
	const own = family.filter(
		(workspace) => workspace.worktree && workspace.worktreeId === workspace.id
	);
	const found = await Promise.all(
		own.map(async (workspace) => {
			const concerns = archiveConcerns(await standingFor(workspace.id));
			return workspace.id === id
				? concerns
				: concerns.map((text) => `“${workspace.title}”: ${text}`);
		})
	);
	return found.flat();
}

/** Archives a workspace and the workspaces its agent started; see `createArchiver`. */
export const archiveWorkspace = (id: string, discard: boolean, actor: string | null = null) =>
	createArchiver({
		workspaces: workspaces(),
		closeTerminals: (workspaceId) => terminals().closeAll(workspaceId),
		removeWorktree: (ref, force) => hub().request({ kind: 'removeWorktree', force, ...ref })
	})(id, discard, actor);
