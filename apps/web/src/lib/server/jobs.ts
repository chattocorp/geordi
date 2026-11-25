import { error } from '@sveltejs/kit';
import { problemOf } from '#lib/problem.ts';
import {
	dependentsOf,
	JOB_TERMINAL,
	type DaemonRequest,
	type DaemonResults,
	type RepoConfig,
	type PortConflict,
	type WorktreeRef
} from '@geordi/protocol';
import type { createTerminals } from './terminals.ts';

/** How long a task gets to be up before what needs it goes ahead regardless. */
const READY_MS = 30_000;
/** A terminal nobody is looking at yet has to have some size. */
const SIZE = { cols: 120, rows: 30 };

type Ask = <K extends DaemonRequest['kind']>(
	request: Extract<DaemonRequest, { kind: K }>,
	timeoutMs?: number
) => Promise<DaemonResults[K]>;

type Task = RepoConfig['tasks'][number];
/** How running one of the tasks asked for went: where to look at it, or what kept it. */
export type Outcome = {
	href?: string;
	problem?: string;
	conflict?: PortConflict & { job: string };
};

/**
 * Runs and stops the tasks a repository has for a workspace (FDR-006), in the order they
 * need each other. Their commands are terminals, which live in the daemon: this only says
 * which to start when, and keeps nothing.
 */
export function createJobs(
	terminals: ReturnType<typeof createTerminals>,
	ask: Ask,
	ref: (workspaceId: string) => WorktreeRef
) {
	const terminalOf = (workspaceId: string, job: string) => ({
		workspaceId,
		terminal: JOB_TERMINAL + job
	});

	/** The workspace's configuration as the daemon reads it now. */
	async function configOf(workspaceId: string): Promise<RepoConfig> {
		try {
			return await ask({ kind: 'config', ...ref(workspaceId) });
		} catch (cause) {
			error(502, cause instanceof Error ? cause.message : String(cause));
		}
	}

	/** Whether something listens on `port`, within the time a task gets. */
	const answers = (port: number, family?: 4 | 6) =>
		ask({ kind: 'portReady', port, family, timeoutMs: READY_MS }, READY_MS + 10_000);

	/**
	 * Waits for a task to be up: for something to listen on each of its ports (at once,
	 * without any). One that never does (a desktop app, a game) is taken to be up once it
	 * has had its time, if it still runs.
	 */
	async function up(workspaceId: string, task: Task) {
		const listens = await Promise.all(task.ports.map(({ port }) => answers(port)));
		if (!listens.every(Boolean) && !terminals.isRunning(terminalOf(workspaceId, task.name)))
			throw new Error(`${task.label ?? task.name} ended before it was up: look at its terminal`);
	}

	/** Where a task's URL leads, once something answers there. */
	async function reach(task: Task, href: string): Promise<Outcome> {
		const url = new URL(href);
		const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
		const family = url.hostname === '127.0.0.1' ? 4 : url.hostname === '[::1]' ? 6 : undefined;
		if (!(await answers(port, family)))
			return { problem: `${task.label ?? task.name}: port ${port} did not become reachable` };
		return { href };
	}

	return {
		async list(workspaceId: string) {
			const { tasks, problem } = await configOf(workspaceId);
			return {
				tasks: tasks.map((task) => ({
					...task,
					running: terminals.isRunning(terminalOf(workspaceId, task.name))
				})),
				problem
			};
		},

		/**
		 * Runs the tasks `names` and what they need, each once what it needs is up, sharing
		 * what they have in common; then says where each one's URL leads once it answers.
		 * `seen` has each command as the person asking saw it: the daemon runs no other.
		 */
		async run(
			workspaceId: string,
			names: string[],
			seen: Record<string, string>,
			confirmation?: string
		) {
			const { tasks } = await configOf(workspaceId);
			const byName = new Map(tasks.map((task) => [task.name, task]));
			const pending = new Map<string, Promise<Outcome>>();
			function launch(name: string): Promise<Outcome> {
				const running = pending.get(name);
				if (running) return running;
				const result = execute(name).catch((cause) => ({
					problem: problemOf(cause, `Could not run ${name}`)
				}));
				pending.set(name, result);
				return result;
			}
			async function execute(name: string): Promise<Outcome> {
				const task = byName.get(name);
				if (!task) return { problem: `There is no task "${name}" any more` };
				const dependencies = await Promise.all(task.needs.map(launch));
				const failed = dependencies.find((result) => result.problem || result.conflict);
				if (failed) return failed;
				if (task.command === null) return {};
				if (task.command !== seen[name] || !task.approved)
					return { problem: `Review the command for ${task.label ?? name} and run it again` };
				const at = terminalOf(workspaceId, name);
				if (!terminals.isRunning(at)) {
					const taken = await ask({
						kind: 'jobPort',
						...ref(workspaceId),
						job: name,
						confirmation
					});
					if (taken) return { conflict: { ...taken, job: task.label ?? name } };
					terminals.start(at, SIZE, { job: name, command: task.command });
				}
				await up(workspaceId, task);
				return {};
			}
			return Promise.all(
				[...new Set(names)].map(async (name) => {
					const outcome = await launch(name);
					const task = byName.get(name);
					if (outcome.problem || outcome.conflict || !task?.href) return { name, ...outcome };
					return { name, ...(await reach(task, task.href)) };
				})
			);
		},

		/** Runs the setup script again, as `command`: the one the person asking saw. */
		setUp(workspaceId: string, command: string) {
			const at = terminalOf(workspaceId, 'setup');
			if (!terminals.isRunning(at)) terminals.start(at, SIZE, { job: 'setup', command });
		},

		/** Stops a task, and the tasks that can't go on without it. */
		async stop(workspaceId: string, name: string) {
			const { tasks } = await configOf(workspaceId);
			for (const task of [name, ...dependentsOf(tasks, name)])
				terminals.close(terminalOf(workspaceId, task));
		}
	};
}
