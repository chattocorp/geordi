import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SPARE_PORTS } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import {
	checkJobPort,
	createPorts,
	free,
	ownPortEnv,
	portAt,
	portEnv,
	portRange,
	portTaken,
	waitForPort
} from './ports.ts';

const file = () => join(mkdtempSync(join(tmpdir(), 'geordi-ports-')), 'ports.json');
const allFree = { isFree: async () => true };

describe('workspace ports', () => {
	const keys = (...keys: string[]) => keys.map((key) => ({ key }));

	it('gives each workspace spare ports of its own, and the same every time it is asked', async () => {
		const at = file();
		const ports = createPorts(at, allFree);
		const one = await ports.ensure('one');
		const two = await ports.ensure('two');
		expect(one).toEqual({ blocks: [{ first: 20000, count: SPARE_PORTS }], jobs: {}, spare: 0 });
		expect(two.blocks).toEqual([{ first: 20010, count: SPARE_PORTS }]);

		expect(await ports.ensure('one')).toEqual(one);
		// also after a restart of the daemon
		expect(await createPorts(at, allFree).ensure('one')).toEqual(one);
	});

	it('gives each port of a task one that stays its own, whatever happens to the others', async () => {
		const ports = createPorts(file(), allFree);
		const first = await ports.ensure('w', keys('web.http', 'web.live', 'db.pg'));
		// runs are claimed in steps of their size: the spare ones start at the next ten
		expect(first.blocks).toEqual([
			{ first: 20000, count: 3 },
			{ first: 20010, count: SPARE_PORTS }
		]);
		expect(first.jobs).toEqual({ 'web.http': 0, 'web.live': 1, 'db.pg': 2 });

		// reordered, one gone and one new: nothing that was assigned moves
		const later = await ports.ensure('w', keys('worker.http', 'db.pg', 'web.http'));
		expect(later.jobs).toMatchObject({ 'web.http': 0, 'web.live': 1, 'db.pg': 2 });
		expect(portAt(later, later.jobs['worker.http'])).toBe(later.blocks[2].first);
		expect(later.spare).toBe(3);
	});

	it('gives a port the one it was kept as before, under the first of its old keys there is', async () => {
		const at = file();
		writeFileSync(
			at,
			JSON.stringify({
				w: { blocks: [{ first: 20000, count: 4 }], jobs: { web: 1, reset: 2, 'api.http': 3 } }
			})
		);
		const assigned = await createPorts(at, allFree).ensure('w', [
			{ key: ':http', legacy: ['web.http', 'web'] },
			{ key: ':live', legacy: ['web.live'] },
			{ key: ':api', legacy: ['api.api', 'api.http', 'api'] },
			{ key: ':desktop', legacy: ['desktop.desktop', 'desktop'] }
		]);
		expect(portAt(assigned, assigned.jobs[':http'])).toBe(20001);
		expect(portAt(assigned, assigned.jobs[':api'])).toBe(20003);
		// ports nobody holds go first, before new ones are claimed
		expect(portAt(assigned, assigned.jobs[':live'])).toBe(20000);
		expect(portAt(assigned, assigned.jobs[':desktop'])).toBe(20004);
		// the spare ones are a run of their own, once
		expect(assigned.blocks).toEqual([
			{ first: 20000, count: 4 },
			{ first: 20004, count: 1 },
			{ first: 20010, count: SPARE_PORTS }
		]);
		expect(assigned.spare).toBe(5);
	});

	it('finds another run where a port is in use, or belongs to another workspace', async () => {
		const busy = new Set([20003, 20015]);
		const ports = createPorts(file(), { isFree: async (port) => !busy.has(port) });
		expect((await ports.ensure('one')).blocks).toEqual([{ first: 20020, count: 10 }]);
		expect((await ports.ensure('two')).blocks).toEqual([{ first: 20030, count: 10 }]);
	});

	it("hands a gone workspace's ports out again, and never the same ones twice at once", async () => {
		const ports = createPorts(file(), allFree);
		const [one, two] = await Promise.all([ports.ensure('one'), ports.ensure('two')]);
		expect(one.blocks[0].first).not.toBe(two.blocks[0].first);

		ports.release('one');
		expect(ports.of('one')).toBeUndefined();
		expect((await ports.ensure('three')).blocks).toEqual(one.blocks);
	});

	it('tells tasks, terminals and agents which ports are theirs', () => {
		const tasks = [
			{
				name: 'web',
				ports: [
					{ name: 'http', port: 20000 },
					{ name: 'live-reload', port: 20001 }
				]
			},
			{ name: 'api', ports: [{ name: 'api-server', port: 20002 }] },
			{ name: 'reset', ports: [] }
		];
		expect(portEnv(tasks, { first: 24000, count: 10 })).toEqual({
			GEORDI_PORT: '24000',
			GEORDI_PORTS: '10',
			GEORDI_PORT_HTTP: '20000',
			GEORDI_PORT_LIVE_RELOAD: '20001',
			GEORDI_PORT_API_SERVER: '20002'
		});
		expect(ownPortEnv(tasks[0])).toEqual({
			PORT: '20000'
		});
		expect(ownPortEnv(tasks[2])).toEqual({});
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
		expect((await ports.ensure('one')).blocks).toEqual([{ first: 30000, count: 10 }]);
		await ports.ensure('two');
		await expect(ports.ensure('three')).rejects.toThrow(/no free ports/);
	});
});
