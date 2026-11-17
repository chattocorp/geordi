import { createImages } from './images.ts';
import { createLive } from './live.ts';
import { views } from './views.ts';
import { createStandings } from './standings.ts';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { NO_WORKTREE, REMOVE_TIMEOUT_MS, type RepoIcon, type WorktreeRef } from '@geordi/protocol';
import {
	GEORDI_AGENT_MAX_CHILDREN,
	GEORDI_AGENT_MAX_DEPTH,
	GEORDI_ALLOWED_HOSTS,
	GEORDI_DAEMON_PORT,
	GEORDI_DATA_DIR,
	GEORDI_LIVE_PORT
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

export const images = lazy(() => createImages(store()));
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

/**
 * Asks a daemon what a worktree has changed, and notes the branch it says the worktree is on,
 * which its agent may have renamed: that is what the worktree comes back from.
 */
const changesOf = (ref: WorktreeRef) =>
	hub()
		.request({ kind: 'changes', ...ref })
		.then((changes) => {
			workspaces().onBranch(ref.worktreeId, changes.branch);
			return changes;
		});

/** Asks a daemon how a worktree's files and branch stand. Never rejects. */
async function loadWorktreeState(worktreeId: string, fresh = false): Promise<WorktreeState> {
	const state: WorktreeState = {
		changes: null,
		unavailable: null,
		missing: false,
		upstream: null,
		config: null,
		release: null
	};
	let ref;
	try {
		ref = workspaces().ref(worktreeId);
	} catch (error) {
		return { ...state, unavailable: reason(error) };
	}

	const [changes, upstream, config, release] = await Promise.allSettled([
		changesOf(ref),
		hub().request({ kind: 'upstream', fresh, ...ref }),
		hub().request({ kind: 'config', ...ref }),
		hub().request({ kind: 'release', ...ref })
	]);
	if (config.status === 'fulfilled') state.config = config.value;
	if (release.status === 'fulfilled') state.release = release.value;
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
	// what a viewer learns, everyone knows: the sidebar shows how each workspace stands
	if (state.changes) standings().note(worktreeId, state);
	return state;
}

/**
 * How every workspace in use stands (see `createStandings`): asked about in the background,
 * the stalest first, for as long as the forge runs.
 */
export const standings = lazy(() => {
	const standings = createStandings({
		worktrees: () => [
			...new Set(
				workspaces()
					.all()
					.filter((workspace) => workspace.worktree)
					.map((workspace) => workspace.worktreeId)
			)
		],
		async load(worktreeId, fresh) {
			const ref = workspaces().ref(worktreeId);
			const [changes, upstream] = await Promise.all([
				changesOf(ref),
				hub()
					.request({ kind: 'upstream', fresh, ...ref })
					.catch(() => null)
			]);
			return { changes, upstream };
		}
	});
	setInterval(() => void standings.tick(), STANDINGS_TICK_MS).unref();
	void standings.tick();
	return standings;
});
const STANDINGS_TICK_MS = 20_000;

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

/**
 * How long after a turn's end its workspace is looked at once more. A forge does not always
 * have what was just done there (a pull request opened a second ago) when it is first asked.
 */
const UPSTREAM_SETTLES_MS = 10_000;

/**
 * Has a workspace's worktree looked at afresh, including how it stands upstream as of now:
 * at once, and again a little later.
 */
function upstreamMayHaveChanged(workspaceId: string) {
	const look = () => {
		try {
			const { worktreeId } = workspaces().ref(workspaceId);
			watchers().changed(worktreeId, true);
			// nobody looking at it: the sidebar still shows how it stands
			if (!watchers().state(worktreeId)) void standings().refresh(worktreeId, true);
		} catch {
			// no such workspace (any more): nobody to tell
		}
	};
	look();
	setTimeout(look, UPSTREAM_SETTLES_MS).unref();
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
		onHello: (_daemonId, running, runningTerminals, ended) => {
			workspaces().reconcile(running);
			terminals().reconcile(runningTerminals, ended);
			watchers().resync();
			// a daemon is there to ask: how the workspaces stand is wanted right away
			void standings().tick();
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
			else if (message.type === 'terminal.ended')
				terminals().ended(message.terminalId, message.status);
			else if (message.type === 'terminal.opened')
				terminals().opened(message.terminalId, message.run);
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
		changesOf(ref).catch(() => null),
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
		// with the repository's teardown script first, which may take a while
		removeWorktree: async (ref, force, teardown) => {
			const { branch } = await hub().request(
				{ kind: 'removeWorktree', force, teardown, ...ref },
				REMOVE_TIMEOUT_MS
			);
			workspaces().onBranch(ref.worktreeId, branch);
		}
	})(id, discard, actor);

/** How long a repository's picture is good for, found or not, before a daemon is asked again. */
const ICON_MS = 10 * 60_000;
const icons = new Map<string, { at: number; icon: Promise<RepoIcon | null> }>();

/**
 * The picture a repository has of itself, as a daemon finds it there (ADR-003: live data,
 * asked for and kept a while, never stored). `null` if it has none, or no daemon can say.
 */
export function repoIcon(repoId: string): Promise<RepoIcon | null> {
	const known = icons.get(repoId);
	if (known && Date.now() - known.at < ICON_MS) return known.icon;
	const icon = hub()
		.request({ kind: 'repoIcon', repoPath: repos().get(repoId).path })
		.catch(() => {
			icons.delete(repoId); // nobody could say: ask again next time
			return null;
		});
	icons.set(repoId, { at: Date.now(), icon });
	return icon;
}

/** The port browsers connect to for what is live on their pages (see `createLive`). */
export const livePort = () => GEORDI_LIVE_PORT || GEORDI_DAEMON_PORT + 1;

/** What a page shows to be let in there: only the forge's own pages are given it. */
export const liveToken = lazy(() => loadSecret(join(GEORDI_DATA_DIR, 'live-token')));

/**
 * What is live on a page, over one WebSocket per window (see `createLive`). It listens
 * where the forge itself does: on this machine only, unless the forge was told otherwise.
 */
export const liveServer = lazy(() =>
	createLive({
		port: livePort(),
		host: process.env.HOST || '127.0.0.1',
		allowed: GEORDI_ALLOWED_HOSTS,
		token: liveToken(),
		views,
		values: (view, signal) => store().live(view.read, view.also, signal),
		terminal: (at, listener) => terminals().attach(at, listener)
	})
);
