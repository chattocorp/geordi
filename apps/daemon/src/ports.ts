import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { dirname } from 'node:path';

/**
 * The ports of workspaces (FDR-006). A workspace gets a run of ports of its own when it
 * first needs one, and keeps exactly those for as long as it lives: across restarts of
 * its jobs, of the daemon and of the machine. That is the whole point, so the assignment
 * is written down, never worked out again, and never changed. Each of a workspace's jobs
 * gets one of them, by name, the first time the job is seen.
 */

type Block = { first: number; count: number };
export type Assigned = {
	/** The workspace's ports, in the order they were given: one run at first, more if it outgrew that. */
	blocks: Block[];
	/** Which of its ports (counting from 0 across the blocks) each job has. */
	jobs: Record<string, number>;
};

/** Where workspaces' ports come from: above what services register, below what systems hand out themselves. */
const RANGE = { from: 20_000, to: 29_999 };

/** Whether nothing on this machine listens on `port`. */
const free = (port: number) =>
	new Promise<boolean>((resolve) => {
		const server = createServer()
			.once('error', () => resolve(false))
			.once('listening', () => server.close(() => resolve(true)))
			.listen(port);
	});

/** Whether something on this machine answers on `port`. */
export const listening = (port: number) =>
	new Promise<boolean>((resolve) => {
		const socket = createConnection({ port, host: 'localhost' })
			.once('connect', () => (socket.destroy(), resolve(true)))
			.once('error', () => resolve(false));
		socket.setTimeout(1000, () => (socket.destroy(), resolve(false)));
	});

/** Waits until something listens on `port`, for `timeoutMs` at most. Resolves to whether something does. */
export async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
	for (const until = Date.now() + timeoutMs; ;) {
		if (await listening(port)) return true;
		if (Date.now() >= until) return false;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

const total = ({ blocks }: Assigned) => blocks.reduce((sum, block) => sum + block.count, 0);

/** The `index`th of a workspace's ports. */
export function portAt({ blocks }: Assigned, index: number): number {
	for (const block of blocks) {
		if (index < block.count) return block.first + index;
		index -= block.count;
	}
	throw new Error('The workspace has no such port');
}

export function createPorts(file: string, isFree: (port: number) => Promise<boolean> = free) {
	let all: Record<string, Assigned> = {};
	try {
		all = JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		// no workspace has ports yet
	}

	function save() {
		mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
		// renamed into place: a half-written file would lose every workspace its ports
		writeFileSync(`${file}.tmp`, JSON.stringify(all, null, '\t'), { mode: 0o600 });
		renameSync(`${file}.tmp`, file);
	}

	/** A run of `count` ports that no workspace has and nothing listens on. */
	async function claim(count: number): Promise<Block> {
		const taken = Object.values(all).flatMap((assigned) => assigned.blocks);
		const clear = (first: number) =>
			taken.every((block) => first + count <= block.first || block.first + block.count <= first);
		for (let first = RANGE.from; first + count - 1 <= RANGE.to; first += count) {
			if (!clear(first)) continue;
			const ports = Array.from({ length: count }, (_, index) => first + index);
			// all of them, now: a run with a port someone else is using is of no use
			if ((await Promise.all(ports.map(isFree))).every(Boolean)) return { first, count };
		}
		throw new Error('There are no free ports left for this workspace');
	}

	/** One at a time: two workspaces asking at once must not be given the same ports. */
	let queue: Promise<unknown> = Promise.resolve();
	const inTurn = <T>(task: () => Promise<T>) => {
		const result = queue.then(task);
		queue = result.catch(() => {});
		return result;
	};

	return {
		/** The workspace's ports as they stand, if it has any. */
		of: (workspaceId: string): Assigned | undefined => all[workspaceId],

		/**
		 * The workspace's ports, with room for `count` of them and one for each of `jobs`.
		 * What it has, it keeps; what is missing is added: a first run of ports that are free
		 * right now, more of them if it has outgrown that, and a port for each job not seen
		 * before.
		 */
		ensure: (workspaceId: string, count: number, jobs: string[] = []) =>
			inTurn(async () => {
				const assigned = all[workspaceId] ?? { blocks: [], jobs: {} };
				const before = JSON.stringify(assigned);

				const unseen = jobs.filter((job) => !(job in assigned.jobs));
				const used = Object.keys(assigned.jobs).length + unseen.length;
				const missing = Math.max(count, used) - total(assigned);
				if (missing > 0) assigned.blocks.push(await claim(missing));
				// a port is a job's for good: one that went away keeps its own, in case it comes back
				for (const job of unseen) assigned.jobs[job] = Object.keys(assigned.jobs).length;

				if (JSON.stringify(assigned) !== before) {
					all[workspaceId] = assigned;
					save();
				}
				return assigned;
			}),

		/** The workspace is gone: its ports are anyone's again. */
		release(workspaceId: string) {
			if (!(workspaceId in all)) return;
			delete all[workspaceId];
			save();
		}
	};
}

/** What a workspace's jobs, terminals and agents are told about its ports. */
export function portEnv(assigned: Assigned): Record<string, string> {
	const env: Record<string, string> = {
		GEORDI_PORT: String(portAt(assigned, 0)),
		GEORDI_PORTS: String(total(assigned)),
		GEORDI_ASSIGNED_PORTS: JSON.stringify(
			Array.from({ length: total(assigned) }, (_, index) => portAt(assigned, index))
		)
	};
	for (const [job, index] of Object.entries(assigned.jobs))
		env[`GEORDI_PORT_${job.toUpperCase().replaceAll('-', '_')}`] = String(portAt(assigned, index));
	return env;
}
