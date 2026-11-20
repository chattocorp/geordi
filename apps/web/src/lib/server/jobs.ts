import { error } from '@sveltejs/kit';
import { problemOf } from '#lib/problem.ts';
import {
	dependentsOf,
	JOB_TERMINAL,
	startOrder,
	type DaemonRequest,
	type DaemonResults,
	type RepoConfig,
	type PortConflict,
	type WorktreeRef
} from '@geordi/protocol';
import type { createTerminals } from './terminals.ts';

/** How long a job gets to be up before what needs it goes ahead regardless. */
const READY_MS = 30_000;
/** A terminal nobody is looking at yet has to have some size. */
const SIZE = { cols: 120, rows: 30 };

type Ask = <K extends DaemonRequest['kind']>(
	request: Extract<DaemonRequest, { kind: K }>,
	timeoutMs?: number
) => Promise<DaemonResults[K]>;

/**
 * Starts and stops the jobs a repository has run for a workspace (FDR-006), in the order
 * they need each other. The jobs themselves are terminals, which live in the daemon: this
 * only says which to start when, and keeps nothing.
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

	/**
	 * Waits for a job to be up: for something to listen on its port. A job that never does
	 * (a desktop app, a game) is taken to be up once it has had its time, if it still runs.
	 */
	async function up(workspaceId: string, job: RepoConfig['jobs'][number]) {
		const listens = await ask(
			{ kind: 'portReady', port: job.port, timeoutMs: READY_MS },
			READY_MS + 10_000
		);
		if (!listens && !terminals.isRunning(terminalOf(workspaceId, job.name)))
			error(409, `${job.name} ended before it was up: look at its terminal`);
	}

	async function startJob(
		workspaceId: string,
		job: RepoConfig['jobs'][number],
		seen: Record<string, string>,
		confirmation?: string
	) {
		const at = terminalOf(workspaceId, job.name);
		if (!terminals.isRunning(at)) {
			const taken = await ask({
				kind: 'jobPort',
				...ref(workspaceId),
				job: job.name,
				confirmation: job.approved && job.command === seen[job.name] ? confirmation : undefined
			});
			if (taken) return { ...taken, job: job.label ?? job.name };
			terminals.start(at, SIZE, { job: job.name, command: seen[job.name] ?? '' });
		}
		return null;
	}

	/**
	 * Starts `names` and what they need, each once what it needs is up. `seen` has each
	 * job's command as the person asking saw it: the daemon runs no other.
	 */
	async function start(
		workspaceId: string,
		names: string[],
		seen: Record<string, string>,
		confirmation?: string,
		wait = false
	) {
		const { jobs } = await configOf(workspaceId);
		const order = startOrder(jobs, names);
		for (const [index, name] of order.entries()) {
			const job = jobs.find((job) => job.name === name)!;
			const conflict = await startJob(workspaceId, job, seen, confirmation);
			if (conflict) return conflict;
			// only something that comes after it has to wait for it
			const needed = order
				.slice(index + 1)
				.some((later) => jobs.find((job) => job.name === later)?.needs.includes(name));
			if (needed || wait) await up(workspaceId, job);
		}
		return null;
	}

	return {
		start: (
			workspaceId: string,
			names: string[],
			seen: Record<string, string>,
			confirmation?: string
		) => start(workspaceId, names, seen, confirmation),

		/** Each selected task shares its prerequisites with the rest of the launch. */
		async runTasks(
			workspaceId: string,
			names: string[],
			seen: Record<string, string>,
			confirmation?: string
		) {
			const config = await configOf(workspaceId);
			const tasks = new Map(config.tasks?.map((task) => [task.name, task]));
			const prerequisites = new Set(
				startOrder([...tasks.values()], names).flatMap((name) => tasks.get(name)!.needs)
			);
			type Outcome = { href?: string; problem?: string; conflict?: PortConflict & { job: string } };
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
				const task = tasks.get(name);
				if (!task) return { problem: `There is no task "${name}" any more` };
				const dependencies = await Promise.all(task.needs.map(launch));
				const failed = dependencies.find((result) => result.problem || result.conflict);
				if (failed) return failed;
				const job = config.jobs.find((job) => job.name === name);
				const link = config.urls.find((link) => link.name === name);
				if (job) {
					if (job.command !== seen[name] || !job.approved)
						return { problem: `Review the command for ${task.label ?? name} and run it again` };
					const conflict = await startJob(workspaceId, job, seen, confirmation);
					if (conflict) return { conflict };
					if (!link && prerequisites.has(name)) await up(workspaceId, job);
				}
				if (!link) return {};
				const url = new URL(link.href);
				const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
				const family = url.hostname === '127.0.0.1' ? 4 : url.hostname === '[::1]' ? 6 : undefined;
				if (
					!(await ask({ kind: 'portReady', port, family, timeoutMs: READY_MS }, READY_MS + 10_000))
				)
					return { problem: `${task.label ?? name}: port ${port} did not become reachable` };
				return { href: link.href };
			}
			return Promise.all(
				[...new Set(names)].map(async (name) => ({ name, ...(await launch(name)) }))
			);
		},

		/** Waits for jobs that were started to be up. */
		async ready(workspaceId: string, names: string[]) {
			const { jobs } = await configOf(workspaceId);
			await Promise.all(
				jobs.filter((job) => names.includes(job.name)).map((job) => up(workspaceId, job))
			);
		},

		/** Runs the setup script again, as `command`: the one the person asking saw. */
		setUp(workspaceId: string, command: string) {
			const at = terminalOf(workspaceId, 'setup');
			if (!terminals.isRunning(at)) terminals.start(at, SIZE, { job: 'setup', command });
		},

		/** Stops a job, and the jobs that can't go on without it. */
		async stop(workspaceId: string, name: string) {
			const { jobs } = await configOf(workspaceId);
			for (const job of [name, ...dependentsOf(jobs, name)])
				terminals.close(terminalOf(workspaceId, job));
		},

		/**
		 * Gets a link ready to be opened: starts the jobs it needs, waits for them to be up,
		 * and returns where it leads.
		 */
		async open(
			workspaceId: string,
			name: string,
			seen: Record<string, string>,
			confirmation?: string
		) {
			const link = (await configOf(workspaceId)).urls.find((link) => link.name === name);
			if (!link) error(404, `There is no link "${name}" any more`);
			const conflict = await start(workspaceId, link.needs, seen, confirmation, true);
			return conflict ?? link.href;
		}
	};
}
