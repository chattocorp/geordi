import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AGENTS, CONFIG_NAME, JOB_TERMINAL, MAX_IMAGES, type FileVersions } from '@geordi/protocol';
import {
	archiveWorkspace as archive,
	concernsAboutArchiving,
	continueWorkspace as carryOn,
	hub,
	jobs,
	prepareWorktree,
	terminals,
	updateWorkspace as update,
	watchers,
	workspaces
} from '#lib/server/app.ts';

const imageIds = v.pipe(
	v.optional(v.string(), '[]'),
	v.transform((value) => {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			return null;
		}
	}),
	v.array(v.pipe(v.string(), v.uuid())),
	v.maxLength(MAX_IMAGES)
);

const text = v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'));

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
		images: imageIds,
		agent: v.picklist(AGENTS),
		/** Empty for "whatever the agent's CLI would use". */
		model: v.optional(v.string()),
		effort: v.optional(v.string()),
		/** May be empty: the workspace is then there to be told what to do, and has its worktree. */
		prompt: v.optional(v.pipe(v.string(), v.trim()), ''),
		/**
		 * A workspace to start this in instead, as another conversation in it, with an agent
		 * working in its directory (FDR-002).
		 */
		alongside: v.optional(v.string())
	}),
	({ model, effort, alongside, ...data }) => {
		const settings = { model, effort };
		if (alongside) {
			const id = workspaces().join(alongside, { ...data, settings });
			// to the workspace it is in, and its conversation there
			const owner = workspaces().summary(id).worktreeId;
			redirect(303, `/workspaces/${owner}?agent=${id}`);
		}
		const id = workspaces().create({ ...data, settings });
		// with nothing to do yet there is no turn to make its worktree for: it is made now, so
		// that there is somewhere to look around and open a terminal in
		if (!data.prompt && !data.images.length)
			prepareWorktree(id).catch((cause) => console.warn(`[worktree] ${cause?.message ?? cause}`));
		redirect(303, `/workspaces/${id}`);
	}
);

/**
 * Says something to the workspace's agent. While it is working, `steer` (the default)
 * interrupts it with the message, and `queue` lets it finish first.
 */
export const sendMessage = form(
	v.pipe(
		v.object({
			workspaceId: v.string(),
			text: v.pipe(v.string(), v.trim()),
			images: imageIds,
			mode: v.optional(v.picklist(['steer', 'queue']), 'steer')
		}),
		v.forward(
			v.check(
				(message) => !!message.text || message.images.length > 0,
				'Write something or add an image first'
			),
			['text']
		)
	),
	({ workspaceId, text, mode, images }) => {
		if (mode === 'queue') workspaces().send(workspaceId, text, null, images);
		else workspaces().steer(workspaceId, text, null, images);
	}
);

/** Says something to the workspace's agent without a form: what the workspace's actions do. */
export const say = command(v.object({ workspaceId: v.string(), text }), ({ workspaceId, text }) =>
	workspaces().send(workspaceId, text)
);

/**
 * Archives a workspace: ends its shells, removes its worktree (unless another workspace
 * still works in it) and takes it out of the lists. Its branch and conversation stay.
 *
 * Unfinished work doesn't stop it, but is not passed over either: unless `confirmed`, a
 * workspace with uncommitted, unpushed or unmerged work is not archived, and what is
 * unfinished about it comes back instead, to be shown and agreed to (FDR-001).
 */
export const archiveWorkspace = command(
	v.object({ workspaceId: v.string(), confirmed: v.optional(v.boolean(), false) }),
	async ({ workspaceId, confirmed }) => {
		if (!confirmed) {
			const concerns = await concernsAboutArchiving(workspaceId);
			if (concerns.length > 0) return { archived: false, concerns };
		}
		// agreed to, what is uncommitted goes with the worktree
		await archive(workspaceId, confirmed);
		return { archived: true, concerns: [] as string[] };
	}
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
 * Brings the latest of the branch the workspace's work is based on into it. Geordi does it
 * itself where git can; where it takes judgement, the agent is asked to, with `prompt`.
 */
export const updateWorkspace = command(
	v.object({ workspaceId: v.string(), prompt: text }),
	({ workspaceId, prompt }) => update(workspaceId, prompt)
);

/** A job's name, and each job's command as the person asking saw it (FDR-006). */
const jobName = v.pipe(v.string(), v.regex(CONFIG_NAME));
const seen = v.record(jobName, v.string());

/**
 * The person has seen these commands of the repository's jobs and agrees to run them
 * (FDR-006). The daemon keeps that, and runs no job's command without it.
 */
export const approveRun = command(
	v.object({ workspaceId: v.string(), commands: v.array(v.pipe(v.string(), v.nonEmpty())) }),
	async ({ workspaceId, commands }) => {
		const ref = workspaces().ref(workspaceId);
		try {
			await hub().request({ kind: 'approveRun', commands, ...ref });
		} catch (cause) {
			error(502, `Could not note that: ${cause instanceof Error ? cause.message : String(cause)}`);
		}
	}
);

/** Starts jobs, and before each the jobs it needs. */
export const startJobs = command(
	v.object({ workspaceId: v.string(), jobs: v.array(jobName), seen }),
	({ workspaceId, jobs: names, seen }) => jobs().start(workspaceId, names, seen)
);

/** Runs the repository's setup script in the workspace, as the person asking saw it. */
export const runSetup = command(
	v.object({ workspaceId: v.string(), command: v.pipe(v.string(), v.nonEmpty()) }),
	({ workspaceId, command }) => jobs().setUp(workspaceId, command)
);

/** Stops a job, and the jobs that need it. */
export const stopJob = command(
	v.object({ workspaceId: v.string(), job: jobName }),
	({ workspaceId, job }) => jobs().stop(workspaceId, job)
);

/** Starts what a link needs, waits for it to be up, and returns where the link leads. */
export const openLink = command(
	v.object({ workspaceId: v.string(), link: jobName, seen }),
	({ workspaceId, link, seen }) => jobs().open(workspaceId, link, seen)
);

/**
 * Has a workspace carry on with new work: on a new branch off the latest upstream, with its
 * conversation as it is.
 */
export const continueWorkspace = command(v.string(), (workspaceId) => carryOn(workspaceId));

/** Brings back a workspace's worktree that was removed outside Geordi, from its branch. */
export const restoreWorktree = command(v.string(), async (workspaceId) => {
	try {
		await prepareWorktree(workspaceId);
	} catch (cause) {
		error(
			502,
			`Could not restore the worktree: ${cause instanceof Error ? cause.message : String(cause)}`
		);
	}
});

/** Starts the conversation of a repository's own workspace afresh (FDR-009). */
export const clearConversation = command(v.string(), (workspaceId) =>
	workspaces().clear(workspaceId)
);

/** Takes back a message that is waiting for the agent to finish its turn. */
export const removeQueued = command(
	v.object({
		workspaceId: v.string(),
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
		/** The message that is meant, in case the queue has moved on. */
		text: v.string(),
		images: v.optional(v.array(v.string()))
	}),
	({ workspaceId, index, text, images }) =>
		workspaces().dequeue(workspaceId, index, text, null, images)
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
	v.object({ ...terminal, ...size }),
	({ cols, rows, ...at }) => {
		// a job's terminal runs a command of the repository's: that takes `startJobs`
		if (at.terminal.startsWith(JOB_TERMINAL)) error(400, 'That name is for a job');
		terminals().start(at, { cols, rows });
	}
);

export const terminalInput = command(
	v.object({ ...terminal, data: v.string() }),
	({ data, ...at }) => terminals().input(at, data)
);

export const terminalResize = command(v.object({ ...terminal, ...size }), ({ cols, rows, ...at }) =>
	terminals().resize(at, { cols, rows })
);

export const closeTerminal = command(v.object(terminal), (at) => terminals().close(at));
