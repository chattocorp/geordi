import { createImages } from './images.ts';
import { createLive } from './live.ts';
import { views } from './views.ts';
import { createStandings } from './standings.ts';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import {
	NO_WORKTREE,
	REMOVE_TIMEOUT_MS,
	UPSTREAM_TICK_MS,
	type RepoIcon,
	type WorktreeRef
} from '@geordi/protocol';
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
import { createHub, daemonAdmission } from './daemons.ts';
import { createJobs } from './jobs.ts';
import { createLimits } from './limits.ts';
import { lazy } from './lazy.ts';
import { createRepos } from './repos.ts';
import { createTerminals } from './terminals.ts';
import { webUrl } from '../url.ts';
import { createWatchers } from './watchers.ts';
import { createWorkspaces } from './workspaces.ts';

/** The forge's services, wired together. Everything is created on first use. */

export const images = lazy(() => createImages(store()));
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

function upstreamOf(ref: WorktreeRef, fresh = false) {
	return hub()
		.request({
			kind: 'upstream',
			includeChecks: watchers().isWatched(ref.worktreeId),
			fresh,
			...ref
		})
		.then((upstream) => {
			if (!upstream) return null;
			const { pull } = upstream;
			return {
				...upstream,
				repoUrl: webUrl(upstream.repoUrl),
				createUrl: webUrl(upstream.createUrl),
				pull: pull && {
					...pull,
					url: webUrl(pull.url),
					checks: pull.checks && {
						...pull.checks,
						url: webUrl(pull.checks.url),
						items: pull.checks.items?.map((item) => ({
							...item,
							url: webUrl(item.url) ?? undefined
						}))
					}
				}
			};
		});
}

/**
 * How every worktree in use stands (see `createStandings`): asked about in the background,
 * the stalest first, for as long as the forge runs.
 */
export const standings = lazy(() => {
	const standings = createStandings({
		worktrees: () => [
			...new Set([
				...workspaces()
					.all()
					// a project has no worktree (FDR-012)
					.filter((workspace) => workspace.worktree && workspace.repoId !== null)
					.map((workspace) => workspace.worktreeId),
				...watchers().ids()
			])
		],
		loadLocal: (id) =>
			Promise.resolve()
				.then(() => changesOf(workspaces().ref(id)))
				.then(
					(changes) => ({ changes, unavailable: null, missing: false }),
					(error) => {
						const unavailable = reason(error);
						return { changes: null, unavailable, missing: unavailable === NO_WORKTREE };
					}
				),
		loadUpstream: async (id, fresh) => upstreamOf(workspaces().ref(id), fresh),
		busy: (id) =>
			workspaces()
				.sharing(id)
				.some((workspace) => workspace.status === 'running'),
		open: (id) => watchers().isWatched(id),
		watch: (ids) =>
			hub().send({
				type: 'watch',
				scope: 'background',
				worktrees: ids.flatMap((id) => {
					try {
						return [workspaces().ref(id)];
					} catch {
						return [];
					}
				})
			}),
		// Not while no daemon is there to ask, nor for a worktree that is yet to be made:
		// neither is a problem with the forge.
		warn: (id, problem) => {
			if (hub().connected().length && problem !== NO_WORKTREE)
				console.warn(`[upstream] could not ask about worktree ${id}: ${problem}`);
		}
	});
	setInterval(() => void standings.tick(), UPSTREAM_TICK_MS).unref();
	// not from in here: what it asks (`watchers`) asks for this in turn
	setImmediate(() => void standings.tick());
	return standings;
});

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
	void standings().look(workspaces().ref(id).worktreeId);
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
	void standings().look(workspace.worktreeId, { fresh: true, announce: true });
}

/**
 * Brings the latest of the branch a workspace's work is based on into it (FDR-003). Where
 * there is nothing to decide (no agent at work in it, nothing uncommitted, no conflicts),
 * the daemon does it with git, at once. Otherwise the agent is asked to, with `prompt`.
 */
export async function updateWorkspace(id: string, prompt: string) {
	const idle = workspaces()
		.sharing(id)
		.every((other) => other.status !== 'running');
	if (idle)
		try {
			const ref = workspaces().ref(id);
			if (await hub().request({ kind: 'updateWorktree', ...ref }, 90_000)) {
				void standings().look(ref.worktreeId);
				return;
			}
		} catch (cause) {
			// no daemon, no worktree: the agent's turn says what is wrong
			console.warn(`[update] ${cause instanceof Error ? cause.message : String(cause)}`);
		}
	workspaces().send(id, prompt, null, [], 'merge-upstream');
}

/**
 * Something happened that may show upstream, and nothing in the worktree says so: the end
 * of a turn (agents push, open pull requests, answer reviews), a merge. Looked at as of now.
 */
export function upstreamMayHaveChanged(workspaceId: string) {
	let ref: WorktreeRef;
	try {
		ref = workspaces().ref(workspaceId);
	} catch {
		// A late turn event can refer to a workspace that is gone.
		return;
	}
	return standings().look(ref.worktreeId, { fresh: true, announce: true });
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
		standings(),
		(id) => {
			const ref = Promise.resolve().then(() => workspaces().ref(id));
			return {
				config: ref.then((ref) => hub().request({ kind: 'config', ...ref })).catch(() => null),
				release: ref.then((ref) => hub().request({ kind: 'release', ...ref })).catch(() => null)
			};
		}
	)
);

export const hub: () => ReturnType<typeof createHub> = lazy(() =>
	createHub(GEORDI_DAEMON_PORT, loadSecret(join(GEORDI_DATA_DIR, 'daemon-token')), {
		admit: daemonAdmission(store(), () => workspaces().hasRunningTurn()),
		onHello: (_daemonId, running, runningTerminals, ended) => {
			workspaces().reconcile(running);
			terminals().reconcile(runningTerminals, ended);
			watchers().resync();
			// a daemon is there to ask: how the workspaces stand is wanted right away
			void standings().tick(true);
		},
		onUsage: (workspaceId, usage) => workspaces().measure(workspaceId, usage),
		onLimits: (workspaceId, known) => limits().note(workspaces().summary(workspaceId).agent, known),
		onMessage: (message) => {
			if (message.type === 'workspace.event') {
				workspaces().record(message.workspaceId, message.event, message.cursor);
				if (message.event.kind === 'turn.completed' || message.event.kind === 'turn.failed')
					upstreamMayHaveChanged(message.workspaceId);
			} else if (message.type === 'terminal.output')
				terminals().output(message.terminalId, message.data, message.offset);
			else if (message.type === 'terminal.exit') terminals().exit(message.terminalId);
			else if (message.type === 'terminal.ended')
				terminals().ended(message.terminalId, message.status);
			else if (message.type === 'terminal.opened')
				terminals().opened(message.terminalId, message.run);
			else if (message.type === 'worktree.changed') standings().changed(message.worktreeId);
		}
	})
);

/** The usage limits of the agents' subscriptions, as their sessions last said (`createLimits`). */
export const limits = lazy(() => createLimits());

/** Check every workspace affected by the archive, including agents sharing a worktree. */
export async function concernsAboutArchiving(id: string) {
	const family = [id, ...workspaces().descendants(id)].map(workspaces().summary);
	const previews = await Promise.all(
		family.map(async (workspace) => {
			let standing: Standing = { changes: null };
			if (workspace.worktree && workspace.worktreeId === workspace.id) {
				await standings().look(workspace.id, { fresh: true });
				const known = standings().state(workspace.id);
				if (known && !known.missing) {
					if (!known.changes) throw new Error(known.unavailable ?? 'No daemon could say');
					// where the forge cannot be asked, what was last known of the pull request
					standing = { changes: known.changes, upstream: known.upstream };
				}
			}
			const concerns = archiveConcerns(standing);
			const blocked = workspaces().summary(workspace.id).status === 'running';
			if (blocked) concerns.push('Stop the running agent before archiving.');
			if (
				terminals().running(workspace.id).length &&
				(await hub()
					.request({ kind: 'terminalActivity', workspaceId: workspace.id })
					.catch(() => true))
			)
				concerns.push('Archiving will stop running terminal processes.');
			return {
				concerns:
					workspace.id === id ? concerns : concerns.map((text) => `“${workspace.title}”: ${text}`),
				discard: !!standing.changes?.uncommitted,
				blocked
			};
		})
	);
	return {
		concerns: previews.flatMap((preview) => preview.concerns),
		discard: previews.some((preview) => preview.discard),
		blocked: previews.some((preview) => preview.blocked)
	};
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
		},
		closeProject: async (projectId) => {
			await hub().request({ kind: 'closeProject', worktreeId: projectId, project: true });
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
		values: (view, signal) => store().live(view.read, view.also, signal, view.affects),
		terminal: (at, listener) => terminals().attach(at, listener)
	})
);
