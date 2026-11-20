import type { PortConflict } from '@geordi/protocol';
import { createHmac, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

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

type Range = { from: number; to: number };

/** Where workspaces' ports come from: above what services register, below what systems hand out themselves. */
const RANGE: Range = { from: 20_000, to: 29_999 };

/**
 * The range in `GEORDI_PORT_RANGE` (`30000-39999`), or the usual one. Two daemons on one
 * machine (the app's and one in development) give out ports without knowing of each
 * other: each needs a range of its own.
 */
export function portRange(value: string | undefined): Range {
	if (!value) return RANGE;
	const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(value);
	const [from, to] = match ? [Number(match[1]), Number(match[2])] : [NaN, NaN];
	if (!(from >= 1024 && from <= to && to <= 65_535))
		throw new Error(
			`GEORDI_PORT_RANGE must be two ports between 1024 and 65535, like 30000-39999: not "${value}"`
		);
	return { from, to };
}

/** Errors that say this machine has no IPv6, rather than that the port is taken. */
const NO_IPV6 = new Set(['EAFNOSUPPORT', 'EADDRNOTAVAIL']);

/**
 * Where something may listen. Each must be tried: on macOS a port can be bound on one of
 * them while another program listens on another (a server on `127.0.0.1` does not keep
 * anyone from `::`, nor one on `0.0.0.0` from `127.0.0.1`).
 */
const HOSTS = ['127.0.0.1', '0.0.0.0', '::1', '::'];

const bindable = (port: number, host: string) =>
	new Promise<boolean>((resolve) => {
		const server = createServer()
			.once('error', (error: NodeJS.ErrnoException) =>
				resolve(host.includes(':') && NO_IPV6.has(error.code ?? ''))
			)
			.once('listening', () => server.close(() => resolve(true)))
			.listen({ port, host, ipv6Only: host === '::' });
	});

/** Whether nothing on this machine listens on `port`, on any of its local addresses. */
export async function free(port: number): Promise<boolean> {
	for (const host of HOSTS) if (!(await bindable(port, host))) return false;
	return true;
}

/** Which program listens on `port`, if `lsof` can tell. */
async function listener(port: number): Promise<PortConflict['listener']> {
	try {
		const { stdout } = await promisify(execFile)(
			'lsof',
			['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
			{ timeout: 2000 }
		);
		const pids = [...stdout.matchAll(/^p(\d+)$/gm)];
		const name = /^c(.+)$/m.exec(stdout)?.[1];
		return name && pids.length === 1 ? { name, pid: Number(pids[0][1]) } : null;
	} catch {
		return null; // no lsof, or nothing it is allowed to see
	}
}

/**
 * What to say when `port` is taken by a program that is not the job's: `null` while it is
 * free. A job's port stays its own (FDR-006), so the job does not start rather than move.
 */
export async function portTaken(port: number): Promise<string | null> {
	if (await free(port)) return null;
	const program = await listener(port);
	return `Port ${port} is in use by another program${program ? `: ${program.name} (process ${program.pid})` : ''}. Stop it, then start this job again.`;
}

// A confirmation belongs to one daemon lifetime, job, port and process incarnation.
const confirmationKey = randomBytes(32);

export async function checkJobPort(
	worktreeId: string,
	job: string,
	port: number,
	confirmation?: string
): Promise<PortConflict | null> {
	if (await free(port)) return null;
	const owner = await listener(port);
	const conflict: PortConflict = { port, listener: owner };
	if (!owner || owner.pid <= 1 || owner.pid === process.pid) return conflict;
	try {
		const { stdout } = await promisify(execFile)('ps', ['-p', String(owner.pid), '-o', 'lstart='], {
			timeout: 2000
		});
		if (!stdout.trim()) return conflict;
		conflict.confirmation = createHmac('sha256', confirmationKey)
			.update(JSON.stringify([worktreeId, job, port, owner.pid, owner.name, stdout.trim()]))
			.digest('hex');
	} catch {
		return conflict;
	}
	if (confirmation !== conflict.confirmation) return conflict;
	try {
		process.kill(owner.pid, 'SIGTERM');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
			return { ...conflict, problem: 'The operating system refused to stop this process.' };
	}
	for (let attempt = 0; attempt < 30; attempt++) {
		if (await free(port)) return null;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	const current = await checkJobPort(worktreeId, job, port);
	return current?.confirmation === confirmation
		? { ...current, problem: 'The process still has this port after the stop request.' }
		: current;
}

/** Whether something on this machine answers on `port`. */
export const listening = (port: number, host = 'localhost') =>
	new Promise<boolean>((resolve) => {
		const socket = createConnection({ port, host })
			.once('connect', () => (socket.destroy(), resolve(true)))
			.once('error', () => resolve(false));
		socket.setTimeout(1000, () => (socket.destroy(), resolve(false)));
	});

/** Waits until something listens on `port`, for `timeoutMs` at most. Resolves to whether something does. */
export async function waitForPort(
	port: number,
	timeoutMs: number,
	host = 'localhost'
): Promise<boolean> {
	for (const until = Date.now() + timeoutMs; ;) {
		if (await listening(port, host)) return true;
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

export function createPorts(
	file: string,
	{
		isFree = free,
		range = RANGE
	}: { isFree?: (port: number) => Promise<boolean>; range?: Range } = {}
) {
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
		for (let first = range.from; first + count - 1 <= range.to; first += count) {
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
