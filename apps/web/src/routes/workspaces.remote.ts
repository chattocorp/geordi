import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AGENTS, type FileVersions } from '@geordi/protocol';
import { store } from '#lib/server/events/index.ts';
import { hub, terminals, watchers, workspaces } from '#lib/server/app.ts';

const text = v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'));

export const getWorkspaces = query.live(v.string(), async function* (repoId) {
	yield* store().live(() => workspaces().list(repoId));
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
export const getWorkspace = query.live(v.string(), async function* (id) {
	yield* store().live(
		() => {
			const workspace = workspaces().get(id);
			const parent = workspace.parentId ? workspaces().summary(workspace.parentId) : null;
			return {
				...workspace,
				parent: parent && { id: parent.id, title: parent.title },
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

export const createWorkspace = form(
	v.object({ repoId: v.string(), agent: v.picklist(AGENTS), prompt: text }),
	(data) => {
		const id = workspaces().create(data);
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
	async ({ workspaceId: id, discard }) => {
		const workspace = workspaces().get(id);
		if (workspace.status === 'running') error(409, 'Stop the agent before archiving');

		terminals().closeAll(id);
		if (workspace.worktree && !workspaces().worktreeInUse(id)) {
			try {
				await hub().request({ kind: 'removeWorktree', force: discard, ...workspaces().ref(id) });
			} catch (reason) {
				error(409, message(reason));
			}
		}
		workspaces().archive(id);
	}
);

/** Takes back a message that is waiting for the agent to finish its turn. */
export const removeQueued = command(
	v.object({ workspaceId: v.string(), index: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
	({ workspaceId, index }) => workspaces().dequeue(workspaceId, index)
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
export const startTerminal = command(v.object({ ...terminal, ...size }), ({ cols, rows, ...at }) =>
	terminals().start(at, { cols, rows })
);

export const terminalInput = command(
	v.object({ ...terminal, data: v.string() }),
	({ data, ...at }) => terminals().input(at, data)
);

export const terminalResize = command(v.object({ ...terminal, ...size }), ({ cols, rows, ...at }) =>
	terminals().resize(at, { cols, rows })
);

export const closeTerminal = command(v.object(terminal), (at) => terminals().close(at));
