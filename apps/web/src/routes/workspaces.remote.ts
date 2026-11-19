import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import {
	AGENTS,
	PERMISSION_MODES,
	CONFIG_NAME,
	JOB_TERMINAL,
	MAX_IMAGES,
	type FileVersions
} from '@geordi/protocol';
import {
	archiveWorkspace as archive,
	concernsAboutArchiving,
	continueWorkspace as carryOn,
	hub,
	jobs,
	prepareWorktree,
	terminals,
	updateWorkspace as update,
	upstreamMayHaveChanged,
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

const agentSettings = {
	model: v.optional(v.string()),
	effort: v.optional(v.string()),
	permissionMode: v.optional(v.picklist(PERMISSION_MODES))
};

/** Applies the workspace settings from the next turn. */
export const configureWorkspace = command(
	v.object({
		workspaceId: v.string(),
		...agentSettings
	}),
	({ workspaceId, ...settings }) => workspaces().configure(workspaceId, settings)
);

export const createWorkspace = form(
	v.object({
		repoId: v.string(),
		images: imageIds,
		agent: v.picklist(AGENTS),
		...agentSettings,
		/** May be empty: the workspace is then there to be told what to do, and has its worktree. */
		prompt: v.optional(v.pipe(v.string(), v.trim()), ''),
		/**
		 * A workspace to start this in instead, as another conversation in it, with an agent
		 * working in its directory (FDR-002).
		 */
		alongside: v.optional(v.string())
	}),
	({ model, effort, permissionMode, alongside, ...data }) => {
		const settings = { model, effort, permissionMode };
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
 * delivers the message to its live session, and `queue` lets it finish first.
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

export const restoreWorkspace = command(v.string(), async (id) => {
	const domain = workspaces();
	const workspace = domain.summary(id);
	if (!workspace.archivedAt) return;
	const ref = domain.ref(id);
	const release = domain.hold([id, ref.worktreeId]);
	try {
		const tree = await hub().request(
			{
				kind: 'prepareWorktree',
				...ref,
				requireBranch: !!ref.branch
			},
			90_000
		);
		domain.restore(id);
		domain.record(id, { kind: 'worktree', ...tree });
		watchers().changed(ref.worktreeId);
	} catch (cause) {
		error(422, cause instanceof Error ? cause.message : 'Could not restore the workspace');
	} finally {
		release();
	}
});

/** Check for unfinished work without changing the workspace. */
export const previewArchive = command(v.string(), concernsAboutArchiving);

export const archiveWorkspace = command(
	v.object({ workspaceId: v.string(), discard: v.boolean() }),
	async ({ workspaceId, discard }) => {
		await archive(workspaceId, discard);
	}
);

/**
 * Merges the workspace's pull request on the forge it is hosted on. Geordi does this
 * itself, through the daemon (ADR-006), rather than asking the agent to.
 */
export const mergePull = command(
	v.object({
		workspaceId: v.string(),
		pullNumber: v.pipe(v.string(), v.regex(/^[1-9]\d*$/)),
		confirmation: v.optional(v.string())
	}),
	async ({ workspaceId, pullNumber, confirmation }) => {
		const ref = workspaces().ref(workspaceId);
		try {
			const status = await hub().request(
				{ kind: 'mergePull', ...ref, pullNumber, confirmation },
				60_000
			);
			if (typeof status === 'string') watchers().changed(ref.worktreeId);
			return status;
		} catch (cause) {
			error(502, `Could not merge: ${cause instanceof Error ? cause.message : String(cause)}`);
		}
	}
);

export const setAutoMerge = command(
	v.object({
		workspaceId: v.string(),
		pullNumber: v.pipe(v.string(), v.regex(/^[1-9]\d*$/)),
		enabled: v.boolean(),
		confirmation: v.optional(v.string())
	}),
	async ({ workspaceId, pullNumber, enabled, confirmation }) => {
		try {
			return await hub().request(
				{
					kind: 'setAutoMerge',
					...workspaces().ref(workspaceId),
					pullNumber,
					enabled,
					confirmation
				},
				60_000
			);
		} catch (cause) {
			error(
				502,
				`Could not change auto-merge: ${cause instanceof Error ? cause.message : String(cause)}`
			);
		} finally {
			upstreamMayHaveChanged(workspaceId);
		}
	}
);

export const markReady = command(
	v.object({ workspaceId: v.string(), pullNumber: v.pipe(v.string(), v.regex(/^[1-9]\d*$/)) }),
	async ({ workspaceId, pullNumber }) => {
		const ref = workspaces().ref(workspaceId);
		try {
			await hub().request({ kind: 'markReady', ...ref, pullNumber }, 60_000);
		} catch (cause) {
			error(
				502,
				`Could not mark the pull request ready for review: ${cause instanceof Error ? cause.message : String(cause)}`
			);
		} finally {
			upstreamMayHaveChanged(workspaceId);
		}
	}
);

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

export const editReleaseNote = command(
	v.object({ workspaceId: v.string(), path: v.string(), original: v.string(), body: v.string() }),
	async ({ workspaceId, ...edit }) => {
		try {
			await hub().request({ kind: 'editReleaseNote', ...workspaces().ref(workspaceId), ...edit });
		} catch (cause) {
			error(409, message(cause));
		}
	}
);

/** Starts jobs, and before each the jobs it needs. */
export const startJobs = command(
	v.object({ workspaceId: v.string(), jobs: v.array(jobName), seen }),
	({ workspaceId, jobs: names, seen }) => jobs().start(workspaceId, names, seen)
);

/**
 * Waits for jobs that were started to be up (something listens on their port), for what
 * shows them booting.
 */
export const jobsReady = command(
	v.object({ workspaceId: v.string(), jobs: v.array(jobName) }),
	({ workspaceId, jobs: names }) => jobs().ready(workspaceId, names)
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
/** Answers something the workspace's agent asked: one answer per question, in their order. */
export const answerQuestion = command(
	v.object({
		workspaceId: v.string(),
		question: v.string(),
		answers: v.pipe(v.array(v.pipe(v.string(), v.maxLength(10_000))), v.maxLength(20))
	}),
	({ workspaceId, question, answers }) => workspaces().answer(workspaceId, question, answers)
);

/** The person moved a workspace in the sidebar: above `before`, or to the end. */
export const moveWorkspace = command(
	v.object({ workspaceId: v.string(), before: v.nullable(v.string()) }),
	({ workspaceId, before }) => workspaces().move(workspaceId, before)
);

export const stopTask = command(
	v.object({ workspaceId: v.string(), stopId: v.string() }),
	({ workspaceId, stopId }) => {
		if (!hub().stopTask(workspaceId, stopId))
			error(409, 'This background task is no longer available.');
	}
);

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

export const getSource = query(
	v.object({ workspaceId: v.string(), path: v.string() }),
	async ({ workspaceId, path }) => {
		try {
			const text = await hub().request({ kind: 'source', path, ...workspaces().ref(workspaceId) });
			if (text !== null) return { text };
			return { unavailable: 'This file is missing or cannot be displayed as text.' };
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
