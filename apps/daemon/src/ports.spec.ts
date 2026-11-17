import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPorts, portAt, portEnv, waitForPort } from './ports.ts';

const file = () => join(mkdtempSync(join(tmpdir(), 'geordi-ports-')), 'ports.json');
const allFree = async () => true;

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
		const ports = createPorts(file(), async (port) => !busy.has(port));
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
