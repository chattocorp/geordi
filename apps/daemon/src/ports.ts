import { portVariable, SPARE_PORTS, type PortConflict, type Task } from '@geordi/protocol';
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
 * is written down, never worked out again, and never changed. Each port a task names gets
 * one of them, by `task.port`, the first time it is seen; and every workspace has a run of
 * spare ones besides, for its agents and terminals.
 */

type Block = { first: number; count: number };
export type Assigned = {
	/** The workspace's ports, in the order they were given: one run at first, more if it outgrew that. */
	blocks: Block[];
	/**
	 * Which of its ports (counting from 0 across the blocks) each named port has, by `:name`.
	 * (`task.port` keys are from when ports were each task's own; a plain `task` key from when
	 * a task had one port, named after it.)
	 */
	jobs: Record<string, number>;
	/** Where its `SPARE_PORTS` spare ones begin: a block of their own. */
	spare?: number;
};

/** What a workspace's port is kept as, by its name: `:http` (apart from the `task.port` keys of before). */
export const portKey = (port: string) => `:${port}`;

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
	return checkPort(worktreeId, job, port, confirmation);
}

/** The first of a task's ports that another program has, as `checkJobPort` says it. */
export async function checkTaskPorts(
	worktreeId: string,
	task: string,
	ports: number[],
	confirmation?: string
): Promise<PortConflict | null> {
	for (const port of ports) {
		const conflict = await checkJobPort(worktreeId, task, port, confirmation);
		if (conflict) return conflict;
	}
	return null;
}

async function checkPort(
	worktreeId: string,
	job: string,
	port: number,
	confirmation?: string
): Promise<PortConflict | null> {
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

	/** A run of `count` ports that no workspace has (nor `mine`, not yet written down) and nothing listens on. */
	async function claim(count: number, mine: Block[]): Promise<Block> {
		const taken = [...Object.values(all).flatMap((assigned) => assigned.blocks), ...mine];
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
		 * The workspace's ports, with one for each of `wanted` (`portKey`s) and its spare
		 * ones. What it has, it keeps; what is missing is added: a port for each key not seen
		 * before (one that was kept under another key before takes that one: the first of
		 * `legacy` it has), from ports it has that nobody holds, or else a new run of free ones.
		 */
		ensure: (workspaceId: string, wanted: { key: string; legacy?: string[] }[] = []) =>
			inTurn(async () => {
				const assigned: Assigned = all[workspaceId] ?? { blocks: [], jobs: {} };
				const before = JSON.stringify(assigned);

				for (const { key, legacy = [] } of wanted) {
					const before = legacy.find((old) => old in assigned.jobs);
					if (!(key in assigned.jobs) && before !== undefined)
						assigned.jobs[key] = assigned.jobs[before];
				}
				const unseen = wanted.filter(({ key }) => !(key in assigned.jobs));
				// a port is a task's for good: one that went away keeps its own, in case it comes back
				const held = new Set(Object.values(assigned.jobs));
				if (assigned.spare !== undefined)
					for (let index = 0; index < SPARE_PORTS; index++) held.add(assigned.spare + index);
				const loose = Array.from({ length: total(assigned) }, (_, index) => index).filter(
					(index) => !held.has(index)
				);
				const missing = unseen.length - loose.length;
				if (missing > 0) {
					const at = total(assigned);
					assigned.blocks.push(await claim(missing, assigned.blocks));
					loose.push(...Array.from({ length: missing }, (_, index) => at + index));
				}
				for (const [index, { key }] of unseen.entries()) assigned.jobs[key] = loose[index];
				if (assigned.spare === undefined) {
					assigned.spare = total(assigned);
					assigned.blocks.push(await claim(SPARE_PORTS, assigned.blocks));
				}

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

/** A workspace's spare ports: the first, and how many. */
export const spareOf = (assigned: Assigned) =>
	assigned.spare === undefined
		? null
		: { first: portAt(assigned, assigned.spare), count: SPARE_PORTS };

/**
 * What a workspace's tasks, terminals and agents are told about its ports: each named one,
 * and the spare ones.
 */
export function portEnv(
	tasks: Pick<Task, 'ports'>[],
	spare: { first: number; count: number } | null
): Record<string, string> {
	const env: Record<string, string> = {};
	if (spare) {
		env.GEORDI_PORT = String(spare.first);
		env.GEORDI_PORTS = String(spare.count);
	}
	for (const { ports } of tasks)
		for (const port of ports) env[portVariable(port.name)] = String(port.port);
	return env;
}

/** What a task's command is told besides: its first port, as `PORT`. */
export function ownPortEnv({ ports }: Pick<Task, 'ports'>): Record<string, string> {
	return ports[0] ? { PORT: String(ports[0].port) } : {};
}
