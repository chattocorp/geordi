import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	checkJobPort,
	createPorts,
	free,
	portAt,
	portEnv,
	portRange,
	portTaken,
	waitForPort
} from './ports.ts';

const file = () => join(mkdtempSync(join(tmpdir(), 'geordi-ports-')), 'ports.json');
const allFree = { isFree: async () => true };

describe('workspace ports', () => {
	it('gives each workspace a run of its own, and the same one every time it is asked', async () => {
		const at = file();
		const ports = createPorts(at, allFree);
		const one = await ports.ensure('one', 10);
		const two = await ports.ensure('two', 10);
		expect(one.blocks).toEqual([{ first: 20000, count: 10 }]);
		expect(two.blocks).toEqual([{ first: 20010, count: 10 }]);

		expect(await ports.ensure('one', 10)).toEqual(one);
		// also after a restart of the daemon
		expect(await createPorts(at, allFree).ensure('one', 10)).toEqual(one);
	});

	it('gives each job a port that stays its own, whatever happens to the others', async () => {
		const ports = createPorts(file(), allFree);
		const first = await ports.ensure('w', 10, ['web', 'db']);
		expect(portAt(first, first.jobs.web)).toBe(20000);
		expect(portAt(first, first.jobs.db)).toBe(20001);

		// reordered, one gone and one new: nothing that was assigned moves
		const later = await ports.ensure('w', 10, ['worker', 'db']);
		expect(portAt(later, later.jobs.db)).toBe(20001);
		expect(portAt(later, later.jobs.web)).toBe(20000);
		expect(portAt(later, later.jobs.worker)).toBe(20002);
	});

	it('finds another run where a port is in use, or belongs to another workspace', async () => {
		const busy = new Set([20003, 20015]);
		const ports = createPorts(file(), { isFree: async (port) => !busy.has(port) });
		expect((await ports.ensure('one', 10)).blocks).toEqual([{ first: 20020, count: 10 }]);
		expect((await ports.ensure('two', 10)).blocks).toEqual([{ first: 20030, count: 10 }]);
	});

	it('keeps what a workspace has when it needs more, and adds to it', async () => {
		const ports = createPorts(file(), allFree);
		await ports.ensure('one', 2, ['a', 'b']);
		await ports.ensure('two', 10);
		const grown = await ports.ensure('one', 4, ['a', 'b', 'c']);
		expect(grown.blocks[0]).toEqual({ first: 20000, count: 2 });
		expect(grown.blocks).toHaveLength(2);
		expect(portAt(grown, grown.jobs.a)).toBe(20000);
		expect(portAt(grown, grown.jobs.c)).toBe(grown.blocks[1].first);
	});

	it("hands a gone workspace's ports out again, and never the same ones twice at once", async () => {
		const ports = createPorts(file(), allFree);
		const [one, two] = await Promise.all([ports.ensure('one', 10), ports.ensure('two', 10)]);
		expect(one.blocks[0].first).not.toBe(two.blocks[0].first);

		ports.release('one');
		expect(ports.of('one')).toBeUndefined();
		expect((await ports.ensure('three', 10)).blocks).toEqual(one.blocks);
	});

	it('tells jobs, terminals and agents which ports are theirs', async () => {
		const assigned = await createPorts(file(), allFree).ensure('w', 10, ['web', 'api-server']);
		expect(portEnv(assigned)).toEqual({
			GEORDI_PORT: '20000',
			GEORDI_PORTS: '10',
			GEORDI_ASSIGNED_PORTS: JSON.stringify(
				Array.from({ length: 10 }, (_, i) => assigned.blocks[0].first + i)
			),
			GEORDI_PORT_WEB: '20000',
			GEORDI_PORT_API_SERVER: '20001'
		});
	});

	it('waits for something to listen on a port, and gives up on time', async () => {
		const server = createServer().listen(0);
		await new Promise((resolve) => server.once('listening', resolve));
		const { port } = server.address() as { port: number };
		expect(await waitForPort(port, 2000)).toBe(true);
		await new Promise((resolve) => server.close(resolve));
		expect(await waitForPort(port, 300)).toBe(false);
	});
});

it('exports the exact assigned port list when allocations span several blocks', () => {
	const env = portEnv({
		blocks: [
			{ first: 20000, count: 2 },
			{ first: 24000, count: 2 }
		],
		jobs: { web: 0, desktop: 2 }
	});
	expect(JSON.parse(env.GEORDI_ASSIGNED_PORTS)).toEqual([20000, 20001, 24000, 24001]);
	expect(env.GEORDI_PORT_DESKTOP).toBe('24000');
});

describe('whether a port is free', () => {
	/** Holds a port on `host`, as another program would. */
	async function hold(host: string) {
		const server = createServer().listen({ port: 0, host });
		await new Promise((resolve) => server.once('listening', resolve));
		const { port } = server.address() as { port: number };
		return { port, close: () => new Promise((resolve) => server.close(resolve)) };
	}

	it.each(['127.0.0.1', '0.0.0.0', '::1', '::'])(
		'is not free while something listens on %s',
		async (host) => {
			const held = await hold(host).catch(() => null);
			if (!held) return; // no IPv6 here
			expect(await free(held.port)).toBe(false);
			expect(await portTaken(held.port)).toMatch(
				new RegExp(`^Port ${held.port} is in use by another program`)
			);
			await held.close();
			expect(await free(held.port)).toBe(true);
			expect(await portTaken(held.port)).toBeNull();
		}
	);

	it('names the program that holds it, where lsof can tell', async () => {
		const held = await hold('127.0.0.1');
		const said = await portTaken(held.port);
		await held.close();
		if (said?.includes('process')) expect(said).toContain(`process ${process.pid}`);
	});
});

it.skipIf(spawnSync('lsof', ['-v']).error || process.platform === 'win32')(
	'only stops the confirmed listener on the same workspace job, then waits for the port',
	async () => {
		async function listen(port: number) {
			const child = spawn(
				process.execPath,
				[
					'-e',
					`
				const server = require('node:net').createServer().listen(${port}, '127.0.0.1', () => process.send(server.address().port));
			`
				],
				{ stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }
			);
			const [bound] = await once(child, 'message');
			return { child, port: Number(bound) };
		}
		const first = await listen(0);
		try {
			const conflict = await checkJobPort('workspace', 'web', first.port);
			expect(conflict?.listener?.pid).toBe(first.child.pid);
			expect(conflict?.confirmation).toBeTruthy();
			expect(await checkJobPort('other', 'web', first.port, conflict!.confirmation)).not.toBeNull();
			const closed = once(first.child, 'exit');
			first.child.kill();
			await closed;
			const next = await listen(first.port);
			try {
				const changed = await checkJobPort('workspace', 'web', first.port, conflict!.confirmation);
				expect(changed?.listener?.pid).toBe(next.child.pid);
				expect(
					await checkJobPort('workspace', 'web', first.port, changed!.confirmation)
				).toBeNull();
				expect(await free(first.port)).toBe(true);
			} finally {
				next.child.kill();
			}
		} finally {
			first.child.kill();
		}
	}
);

describe('the range ports come from', () => {
	it('is the usual one unless the environment says otherwise', () => {
		expect(portRange(undefined)).toEqual({ from: 20000, to: 29999 });
		expect(portRange('30000-39999')).toEqual({ from: 30000, to: 39999 });
	});

	it.each(['30000', '39999-30000', '80-1000', '30000-70000', 'a-b', '30000-39999x'])(
		'refuses %s',
		(value) => expect(() => portRange(value)).toThrow(/GEORDI_PORT_RANGE/)
	);

	it('gives out ports from the range it is given', async () => {
		const ports = createPorts(file(), { ...allFree, range: { from: 30000, to: 30019 } });
		expect((await ports.ensure('one', 10)).blocks).toEqual([{ first: 30000, count: 10 }]);
		await ports.ensure('two', 10);
		await expect(ports.ensure('three', 10)).rejects.toThrow(/no free ports/);
	});
});
