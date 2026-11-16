import { error } from '@sveltejs/kit';
import {
	dependentsOf,
	JOB_TERMINAL,
	startOrder,
	type DaemonRequest,
	type DaemonResults,
	type RepoConfig,
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

	/**
	 * Starts `names` and what they need, each once what it needs is up. `seen` has each
	 * job's command as the person asking saw it: the daemon runs no other.
	 */
	async function start(
		workspaceId: string,
		names: string[],
		seen: Record<string, string>,
		wait = false
	) {
		const { jobs } = await configOf(workspaceId);
		const order = startOrder(jobs, names);
		for (const [index, name] of order.entries()) {
			const job = jobs.find((job) => job.name === name)!;
			const at = terminalOf(workspaceId, name);
			if (!terminals.isRunning(at))
				terminals.start(at, SIZE, { job: name, command: seen[name] ?? '' });
			// only something that comes after it has to wait for it
			const needed = order
				.slice(index + 1)
				.some((later) => jobs.find((job) => job.name === later)?.needs.includes(name));
			if (needed || wait) await up(workspaceId, job);
		}
	}

	return {
		start: (workspaceId: string, names: string[], seen: Record<string, string>) =>
			start(workspaceId, names, seen),

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
		async open(workspaceId: string, name: string, seen: Record<string, string>) {
			const link = (await configOf(workspaceId)).urls.find((link) => link.name === name);
			if (!link) error(404, `There is no link "${name}" any more`);
			await start(workspaceId, link.needs, seen, true);
			return link.href;
		}
	};
}
