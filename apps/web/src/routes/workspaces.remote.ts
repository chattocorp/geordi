import { ACTION_IDS } from '@geordi/ui/actions';
import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import {
	AGENTS,
	PERMISSION_MODES,
	CONFIG_NAME,
	JOB_TERMINAL,
	MAX_IMAGES,
	FILE_SEARCH_TIMEOUT_MS,
	type FileVersions
} from '@geordi/protocol';
import {
	archiveWorkspace as archive,
	branchesOf,
	changeBase,
	concernsAboutArchiving,
	continueWorkspace as carryOn,
	hub,
	jobs,
	repos,
	prepareWorktree,
	releasePurgedTurnRefs,
	standings,
	terminals,
	updateWorkspace as update,
	upstreamMayHaveChanged,
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

export const renameWorkspace = command(
	v.object({ workspaceId: v.string(), title: v.string() }),
	({ workspaceId, title }) => workspaces().rename(workspaceId, title)
);

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
		/** New projects (FDR-012) can no longer be started: every workspace is in a repository. */
		repoId: v.pipe(v.string(), v.minLength(1, 'Pick a repository to work in')),
		images: imageIds,
		agent: v.picklist(AGENTS),
		...agentSettings,
		/** May be empty: the workspace is then there to be told what to do, and has its worktree. */
		prompt: v.optional(v.pipe(v.string(), v.trim()), ''),
		/** The branch its worktree starts from; empty for where work in the repository starts. */
		base: v.optional(v.pipe(v.string(), v.trim()), ''),
		/**
		 * A workspace to start this in instead, as another conversation in it, with an agent
		 * working in its directory (FDR-002).
		 */
		alongside: v.optional(v.string()),
		/** An item written down earlier to start it on (FDR-017). */
		itemId: v.optional(v.string())
	}),
	({ model, effort, permissionMode, alongside, repoId, base, itemId, ...data }) => {
		const offered = hub().harnesses();
		if (offered && !offered.some((h) => h.agent === data.agent))
			error(409, `Provider ${data.agent} is unavailable`);
		const settings = { model, effort, permissionMode };
		if (alongside) {
			const id = workspaces().join(alongside, { ...data, settings });
			// to the workspace it is in, and its conversation there
			const owner = workspaces().summary(id).worktreeId;
			redirect(303, `/workspaces/${owner}?agent=${id}`);
		}
		const id = workspaces().create({
			...data,
			repoId,
			settings,
			...(base && { base }),
			...(itemId && { itemId })
		});
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
export const say = command(
	v.object({ workspaceId: v.string(), text, action: v.optional(v.picklist(ACTION_IDS)) }),
	({ workspaceId, text, action }) => workspaces().send(workspaceId, text, null, [], action)
);

export const restoreWorkspace = command(v.string(), async (id) => {
	const domain = workspaces();
	const workspace = domain.summary(id);
	if (!workspace.archivedAt) return;
	// a project has no worktree to bring back: its folder is made again, empty, when it next works
	if (workspace.repoId === null) return domain.restore(id);
	if (
		!repos()
			.list()
			.some((repo) => repo.id === workspace.repoId)
	)
		error(
			409,
			'Add the original checkout in Settings → Repositories before restoring this workspace.'
		);
	const ref = domain.ref(id);
	const release = domain.hold([id, ref.worktreeId], 'being restored');
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
		void standings().look(ref.worktreeId);
	} catch (cause) {
		error(422, cause instanceof Error ? cause.message : 'Could not restore the workspace');
	} finally {
		release();
	}
});

/**
 * Deletes archived workspaces for good, with the agents they started (ADR-012, FDR-014).
 * Says how many went, and how many bytes the event log got smaller by.
 */
export const purgeWorkspaces = command(v.array(v.string()), (ids) => {
	const result = workspaces().purge(ids);
	void releasePurgedTurnRefs();
	return result;
});

/** Check for unfinished work without changing the workspace. */
export const previewArchive = command(v.string(), concernsAboutArchiving);

export const archiveWorkspace = command(
	v.object({
		workspaceId: v.string(),
		discard: v.boolean(),
		stopAgents: v.optional(v.boolean(), false)
	}),
	async ({ workspaceId, discard, stopAgents }) => {
		await archive(workspaceId, discard, null, stopAgents);
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
			// A queue acknowledgment alone doesn't tell us the new standing.
			if (status === 'queued') await upstreamMayHaveChanged(workspaceId);
			else if (status === 'merged') {
				// Known at once: the look after it must not announce itself, or the ribbon would
				// hold on to the standing from before the merge until the forge has answered.
				standings().merged(ref.worktreeId, pullNumber);
				void standings().look(ref.worktreeId, { fresh: true });
			}
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

/**
 * Runs tasks (FDR-006), and before each what it needs; answers, for each, where its URL
 * leads once it answers, or what kept it.
 */
export const runTasks = command(
	v.object({
		workspaceId: v.string(),
		tasks: v.array(jobName),
		seen,
		confirmation: v.optional(v.string())
	}),
	({ workspaceId, tasks, seen, confirmation }) => jobs().run(workspaceId, tasks, seen, confirmation)
);

/** Runs the repository's setup script in the workspace, as the person asking saw it. */
export const runSetup = command(
	v.object({ workspaceId: v.string(), command: v.pipe(v.string(), v.nonEmpty()) }),
	({ workspaceId, command }) => jobs().setUp(workspaceId, command)
);

/** Stops a task, and the tasks that need it. */
export const stopJob = command(
	v.object({ workspaceId: v.string(), job: jobName }),
	({ workspaceId, job }) => jobs().stop(workspaceId, job)
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

/**
 * The person moved an item in the outline, with what is under it (FDR-016, FDR-017): above
 * `before`, or to the end; with `parentId`, under that item, or to the top where that is `null`.
 */
export const moveItem = command(
	v.object({
		itemId: v.string(),
		before: v.nullable(v.string()),
		parentId: v.optional(v.nullable(v.string()))
	}),
	({ itemId, before, parentId }) => workspaces().move(itemId, before, parentId)
);

/** The person wrote a new item (FDR-017). Returns its ID. */
export const addItem = command(
	v.object({
		parentId: v.nullable(v.string()),
		before: v.nullable(v.string()),
		text: v.pipe(v.string(), v.maxLength(2000))
	}),
	(item) => workspaces().addItem(item)
);

/** The person changed an item's text (a workspace's: its name) or note. */
export const editItem = command(
	v.object({
		itemId: v.string(),
		text: v.optional(v.pipe(v.string(), v.maxLength(2000))),
		note: v.optional(v.pipe(v.string(), v.maxLength(20_000)))
	}),
	({ itemId, ...changes }) => workspaces().editItem(itemId, changes)
);

export const completeItem = command(
	v.object({ itemId: v.string(), done: v.boolean() }),
	({ itemId, done }) => workspaces().completeItem(itemId, done)
);

export const removeItem = command(v.object({ itemId: v.string() }), ({ itemId }) =>
	workspaces().removeItem(itemId)
);

export const lockWorkspace = command(
	v.object({ workspaceId: v.string(), locked: v.boolean() }),
	({ workspaceId, locked }) => workspaces().lock(workspaceId, locked)
);

export const setWorkspaceInactive = command(
	v.object({ workspaceId: v.string(), inactive: v.boolean() }),
	({ workspaceId, inactive }) => workspaces().setInactive(workspaceId, inactive)
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

// A worktree can change between keystrokes. Each search needs a fresh daemon response.
export const findFiles = command(
	v.union([
		v.object({ workspaceId: v.string(), query: v.string() }),
		v.object({ repoId: v.string(), query: v.string() })
	]),
	(scope) =>
		hub().request(
			{
				kind: 'findFiles',
				query: scope.query,
				...('workspaceId' in scope
					? workspaces().ref(scope.workspaceId)
					: { repoPath: repos().get(scope.repoId).path })
			},
			FILE_SEARCH_TIMEOUT_MS
		)
);

/**
 * The branches a new worktree in a repository may start from, the most recently committed to
 * first, and the one it starts from unless another is chosen. Asked when someone looks.
 */
export const listBranches = command(v.string(), (repoId) => branchesOf(repos().get(repoId).path));

/** Measures a workspace's work against another branch (`null`: the repository's main one). */
export const setBase = command(
	v.object({ workspaceId: v.string(), base: v.nullable(v.pipe(v.string(), v.minLength(1))) }),
	({ workspaceId, base }) => changeBase(workspaceId, base)
);

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

/** The browser names a saved turn and file. Only the forge chooses which Git objects to read. */
export const getTurnFile = query(
	v.object({
		workspaceId: v.string(),
		turn: v.pipe(v.number(), v.integer(), v.minValue(1)),
		path: v.string()
	}),
	async ({ workspaceId, turn, path }) => {
		try {
			const blobs = await workspaces().turnBlobs(workspaceId, turn, path);
			if (!blobs) return null;
			const { repoPath } = workspaces().ref(workspaceId);
			return await hub().request({ kind: 'turnFile', repoPath, blobs });
		} catch {
			return null;
		}
	}
);

export const getSource = query(
	v.object({ workspaceId: v.string(), path: v.string() }),
	async ({ workspaceId, path }) => {
		try {
			const content = await hub().request({
				kind: 'source',
				path,
				...workspaces().ref(workspaceId)
			});
			if (content !== null) return { content };
			return { unavailable: 'This file is missing or cannot be displayed.' };
		} catch (error) {
			return { unavailable: `Could not load the file: ${message(error)}` };
		}
	}
);

/** Which of these paths, named in a conversation, are files in the workspace's worktree, and which directories. */
export const findPaths = command(
	v.object({ workspaceId: v.string(), paths: v.pipe(v.array(v.string()), v.maxLength(100)) }),
	({ workspaceId, paths }) =>
		hub().request({ kind: 'paths', paths, ...workspaces().ref(workspaceId) })
);

/** Opens a directory in the workspace's worktree in the file manager (Finder). */
export const openFolder = command(
	v.object({ workspaceId: v.string(), path: v.string() }),
	({ workspaceId, path }) =>
		hub().request({ kind: 'openFolder', path, ...workspaces().ref(workspaceId) })
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
