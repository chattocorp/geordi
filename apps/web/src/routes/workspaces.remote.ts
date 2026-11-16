import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AGENTS, type FileVersions, type Harness } from '@geordi/protocol';
import { live } from '#lib/server/events/index.ts';
import type { WorkspaceSummary } from '#lib/server/workspaces.ts';
import {
	archiveWorkspace as archive,
	hub,
	terminals,
	watchers,
	workspaces
} from '#lib/server/app.ts';

const text = v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'));

export const getWorkspaces = query.live(v.string(), async function* (repoId) {
	yield* live(() => workspaces().list(repoId));
});

/**
 * One workspace with its conversation. `parent` is the workspace whose agent started this
 * one, if any.
 *
 * While someone has this open, a daemon watches the workspace's files, and `git` is how
 * its changes and its pull request stand: loaded here once for everyone looking, and again
 * whenever something changes. `null` until first loaded.
 * `terminals` names the workspace's terminals whose shells are running.
 */
/** What a workspace shows of the one that started it, and of those it started. */
const relative = ({ id, title, status }: WorkspaceSummary) => ({ id, title, status });

export const getWorkspace = query.live(v.string(), async function* (id) {
	yield* live(
		() => {
			const workspace = workspaces().get(id);
			const parent = workspace.parentId ? workspaces().summary(workspace.parentId) : null;
			return {
				...workspace,
				parent: parent && relative(parent),
				children: workspaces().children(id).map(relative),
				git: watchers().state(workspace.worktreeId),
				terminals: terminals().running(id)
			};
		},
		(changed) => {
			const unwatch = watchers().watch(workspaces().summary(id).worktreeId, changed);
			const unsubscribe = terminals().subscribe(changed);
			return () => {
				unwatch();
				unsubscribe();
			};
		}
	);
});

/**
 * What each agent can be asked to run: its models and their effort levels, as the
 * connected daemon reports them. `null` while no daemon is connected; live, so that they
 * are there the moment one is.
 */
export const getHarnesses = query.live(async function* () {
	yield* live(
		(): Harness[] | null => hub().harnesses(),
		(changed) => hub().subscribe(changed)
	);
});

/** Chooses the model and effort a workspace's agent runs with from its next turn on. */
export const configureWorkspace = command(
	v.object({
		workspaceId: v.string(),
		/** Absent for "whatever the agent's CLI would use". */
		model: v.optional(v.string()),
		effort: v.optional(v.string())
	}),
	({ workspaceId, ...settings }) => workspaces().configure(workspaceId, settings)
);

export const createWorkspace = form(
	v.object({
		repoId: v.string(),
		agent: v.picklist(AGENTS),
		/** Empty for "whatever the agent's CLI would use". */
		model: v.optional(v.string()),
		effort: v.optional(v.string()),
		prompt: text
	}),
	({ model, effort, ...data }) => {
		const id = workspaces().create({ ...data, settings: { model, effort } });
		redirect(303, `/workspaces/${id}`);
	}
);

/**
 * Says something to the workspace's agent. While it is working, `steer` (the default)
 * interrupts it with the message, and `queue` lets it finish first.
 */
export const sendMessage = form(
	v.object({
		workspaceId: v.string(),
		text,
		mode: v.optional(v.picklist(['steer', 'queue']), 'steer')
	}),
	({ workspaceId, text, mode }) => {
		if (mode === 'queue') workspaces().send(workspaceId, text);
		else workspaces().steer(workspaceId, text);
	}
);

/** Says something to the workspace's agent without a form: what the workspace's actions do. */
export const say = command(v.object({ workspaceId: v.string(), text }), ({ workspaceId, text }) =>
	workspaces().send(workspaceId, text)
);

/**
 * Archives a workspace: ends its shells, removes its worktree (unless another workspace
 * still works in it) and takes it out of the lists. Its branch and conversation stay.
 * Fails if the worktree has uncommitted or untracked files, unless `discard` is set.
 */
export const archiveWorkspace = command(
	v.object({ workspaceId: v.string(), discard: v.optional(v.boolean(), false) }),
	({ workspaceId, discard }) => archive(workspaceId, discard)
);

/**
 * Merges the workspace's pull request on the forge it is hosted on. Geordi does this
 * itself, through the daemon (ADR-006), rather than asking the agent to.
 */
export const mergePull = command(v.string(), async (workspaceId) => {
	const ref = workspaces().ref(workspaceId);
	try {
		await hub().request({ kind: 'mergePull', ...ref }, 60_000);
	} catch (cause) {
		error(502, `Could not merge: ${cause instanceof Error ? cause.message : String(cause)}`);
	}
	watchers().changed(ref.worktreeId);
});

/**
 * The person has seen the repository's run command and agrees to run it (FDR-006). The
 * daemon keeps that, and runs no run command without it.
 */
export const approveRun = command(
	v.object({ workspaceId: v.string(), command: v.pipe(v.string(), v.nonEmpty()) }),
	async ({ workspaceId, command }) => {
		const ref = workspaces().ref(workspaceId);
		try {
			await hub().request({ kind: 'approveRun', command, ...ref });
		} catch (cause) {
			error(502, `Could not note that: ${cause instanceof Error ? cause.message : String(cause)}`);
		}
	}
);

/** Brings back a workspace's worktree that was removed outside Geordi, from its branch. */
export const restoreWorktree = command(v.string(), async (workspaceId) => {
	const ref = workspaces().ref(workspaceId);
	try {
		await hub().request({ kind: 'restoreWorktree', ...ref }, 60_000);
	} catch (cause) {
		error(
			502,
			`Could not restore the worktree: ${cause instanceof Error ? cause.message : String(cause)}`
		);
	}
	watchers().changed(ref.worktreeId);
});

/** Takes back a message that is waiting for the agent to finish its turn. */
export const removeQueued = command(
	v.object({
		workspaceId: v.string(),
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
		/** The message that is meant, in case the queue has moved on. */
		text: v.string()
	}),
	({ workspaceId, index, text }) => workspaces().dequeue(workspaceId, index, text)
);

/** Stops the workspace's agent, if it is working. */
export const stopAgent = command(v.string(), (id) => workspaces().stop(id));

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Both versions of a changed file, for the diff viewer. */
export const getDiff = query(
	v.object({ workspaceId: v.string(), path: v.string() }),
	async ({ workspaceId, path }): Promise<FileVersions> => {
		try {
			return await hub().request({ kind: 'diff', path, ...workspaces().ref(workspaceId) });
		} catch (error) {
			return { unavailable: `Could not load the file: ${message(error)}` };
		}
	}
);

const dimension = v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(500));
const size = { cols: dimension, rows: dimension };
/** One of a workspace's terminals; the browser that opens a terminal names it. */
const terminal = {
	workspaceId: v.string(),
	terminal: v.pipe(v.string(), v.regex(/^[\w-]{1,40}$/))
};

/** Starts a terminal's shell. Only ever called because a person asked for a terminal. */
export const startTerminal = command(
	// `command`: for the run terminal, the run command as the person pressing Run saw it
	v.object({ ...terminal, ...size, command: v.optional(v.string()) }),
	({ cols, rows, command, ...at }) => terminals().start(at, { cols, rows }, command)
);

export const terminalInput = command(
	v.object({ ...terminal, data: v.string() }),
	({ data, ...at }) => terminals().input(at, data)
);

export const terminalResize = command(v.object({ ...terminal, ...size }), ({ cols, rows, ...at }) =>
	terminals().resize(at, { cols, rows })
);

export const closeTerminal = command(v.object(terminal), (at) => terminals().close(at));
