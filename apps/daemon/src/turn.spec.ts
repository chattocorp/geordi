import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import type { AgentAdapter } from './agents/adapter.ts';
import { resumeTurns, runTurn } from './turn.ts';

/** An adapter that runs a Node one-liner and passes its JSON lines through as events. */
const fake = (script: string): AgentAdapter => ({
	offers: () => ({ models: [], efforts: [] }),
	command: () => ({ cmd: process.execPath, args: ['-e', script] }),
	parse: (line) => [line as AgentEvent]
});

const options = {
	sessionId: 's',
	prompt: '',
	cwd: process.cwd(),
	writableRoots: [],
	resumeId: null,
	api: null,
	settings: {}
};

const turnsDir = () => mkdtempSync(join(tmpdir(), 'geordi-turns-'));
const say = (event: AgentEvent) => `console.log(JSON.stringify(${JSON.stringify(event)}));`;

async function collect(adapter: AgentAdapter) {
	const events: AgentEvent[] = [];
	await runTurn(adapter, 'claude', options, (e) => events.push(e), join(turnsDir(), 'w')).done;
	return events;
}

describe('runTurn', () => {
	it('passes events through and ends once', async () => {
		const events = await collect(
			fake(`
				${say({ kind: 'text', text: 'hi' })}
				console.log('not json');
				${say({ kind: 'turn.completed' })}
			`)
		);
		expect(events).toEqual([{ kind: 'text', text: 'hi' }, { kind: 'turn.completed' }]);
	});

	it('ends the turn when the process does, not when the CLI first says it is done', async () => {
		// a resumed session: something left over is wrapped up and reported as done, and only
		// then comes the answer to the new message
		const events = await collect(
			fake(`
				${say({ kind: 'resume', id: 's' })}
				${say({ kind: 'turn.completed' })}
				setTimeout(() => {
					${say({ kind: 'text', text: 'the actual answer' })}
					${say({ kind: 'turn.completed' })}
				}, 300);
			`)
		);
		expect(events).toEqual([
			{ kind: 'resume', id: 's' },
			{ kind: 'text', text: 'the actual answer' },
			{ kind: 'turn.completed' }
		]);
	});

	it('goes by the last word on how the turn ended', async () => {
		const events = await collect(
			fake(`
				${say({ kind: 'turn.completed' })}
				${say({ kind: 'turn.failed', error: 'out of credit' })}
			`)
		);
		expect(events).toEqual([{ kind: 'turn.failed', error: 'out of credit' }]);
	});

	it('fails the turn when the process exits without finishing', async () => {
		const events = await collect(fake(`console.error('kaputt'); process.exit(3)`));
		expect(events).toEqual([
			{ kind: 'turn.failed', error: expect.stringMatching(/code 3.*kaputt/) }
		]);
	});

	it('fails the turn when the command does not exist', async () => {
		const events = await collect({
			...fake(''),
			command: () => ({ cmd: 'no-such-agent-cli', args: [] })
		});
		expect(events).toEqual([
			{ kind: 'turn.failed', error: expect.stringMatching(/Failed to start no-such-agent-cli/) }
		]);
	});

	it('reports stopped turns', async () => {
		const events: AgentEvent[] = [];
		const dir = join(turnsDir(), 'w');
		const turn = runTurn(
			fake('setTimeout(() => {}, 10000)'),
			'claude',
			options,
			(e) => events.push(e),
			dir
		);
		turn.stop();
		await turn.done;
		expect(events).toEqual([{ kind: 'turn.failed', error: 'Stopped' }]);
	});
});

describe('a turn that misbehaves', () => {
	it('skips a line the adapter cannot make sense of, and carries on', async () => {
		const adapter: AgentAdapter = {
			...fake(`
				console.log('null');
				${say({ kind: 'text', text: 'still here' })}
				${say({ kind: 'turn.completed' })}
			`),
			parse(line) {
				if (line === null) throw new TypeError('unexpected');
				return [line as AgentEvent];
			}
		};
		expect(await collect(adapter)).toEqual([
			{ kind: 'text', text: 'still here' },
			{ kind: 'turn.completed' }
		]);
	});

	it('is only over when the agent is, however long it takes to stop', async () => {
		// an agent that takes its time to wind down
		const slow = fake(`
			process.on('SIGTERM', () => setTimeout(() => process.exit(0), 600));
			setTimeout(() => {}, 10000);
		`);
		const events: AgentEvent[] = [];
		const turn = runTurn(slow, 'claude', options, (e) => events.push(e), join(turnsDir(), 'w'));
		await new Promise((resolve) => setTimeout(resolve, 300)); // let it install its handler
		const stopped = Date.now();
		turn.stop();
		await turn.done;
		expect(Date.now() - stopped).toBeGreaterThanOrEqual(500);
		expect(events).toEqual([{ kind: 'turn.failed', error: 'Stopped' }]);
	});

	it('fails cleanly when the agent cannot be started at all', () => {
		const dir = join(turnsDir(), 'w');
		const nowhere = { ...options, cwd: '/no/such/directory' };
		expect(() => runTurn(fake(''), 'claude', nowhere, () => {}, dir)).toThrow(/Failed to start/);
		expect(existsSync(dir)).toBe(false);
	});
});

describe('with nobody to report to', () => {
	it("keeps everything in the turn's files until there is, even across a restart", async () => {
		const dir = turnsDir();
		const quick = fake(`${say({ kind: 'text', text: 'hi' })} ${say({ kind: 'turn.completed' })}`);
		const unheard: AgentEvent[] = [];
		const turn = runTurn(
			quick,
			'claude',
			options,
			(e) => unheard.push(e),
			join(dir, 'w'),
			'',
			() => false
		);
		await new Promise((resolve) => setTimeout(resolve, 600));
		turn.detach(); // the daemon goes away, having told nobody
		expect(unheard).toEqual([]);

		const heard: AgentEvent[] = [];
		const turns = await resumeTurns(
			dir,
			async () => quick,
			() => (e) => heard.push(e)
		);
		await turns.get('w')!.done;
		expect(heard).toEqual([{ kind: 'text', text: 'hi' }, { kind: 'turn.completed' }]);
	});
});

describe('a daemon restart', () => {
	it("does not take somebody else's process for the agent, nor signal it", async () => {
		const dir = turnsDir();
		// what a reboot leaves behind: a turn whose process ID now belongs to another process
		// (this one, here), which started at another time
		mkdirSync(join(dir, 'w'));
		writeFileSync(
			join(dir, 'w', 'meta.json'),
			JSON.stringify({ agent: 'claude', cmd: 'claude', pid: process.pid, started: 'long ago' })
		);
		writeFileSync(join(dir, 'w', 'out.jsonl'), '');
		writeFileSync(join(dir, 'w', 'err.log'), '');

		const events: AgentEvent[] = [];
		const turns = await resumeTurns(
			dir,
			async () => fake(''),
			() => (e) => events.push(e)
		);
		turns.get('w')!.stop(); // must not reach us
		await turns.get('w')!.done;
		expect(events).toEqual([{ kind: 'turn.failed', error: 'Stopped' }]);
	});

	const slow = fake(`
		${say({ kind: 'text', text: 'one' })}
		setTimeout(() => {
			${say({ kind: 'text', text: 'two' })}
			${say({ kind: 'turn.completed' })}
		}, 800);
	`);
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	const adapterFor = async () => slow;

	it('leaves the agent working, and the next daemon carries on where the last one left off', async () => {
		const dir = turnsDir();
		const before: AgentEvent[] = [];
		const turn = runTurn(slow, 'claude', options, (e) => before.push(e), join(dir, 'w'));
		await wait(400);
		turn.detach(); // the daemon goes away
		expect(before).toEqual([{ kind: 'text', text: 'one' }]);

		const after: AgentEvent[] = [];
		const turns = await resumeTurns(dir, adapterFor, () => (e) => after.push(e));
		expect([...turns.keys()]).toEqual(['w']);
		await turns.get('w')!.done;
		// nothing twice, nothing missing
		expect(after).toEqual([{ kind: 'text', text: 'two' }, { kind: 'turn.completed' }]);
		expect((await resumeTurns(dir, adapterFor, () => () => {})).size).toBe(0);
	});

	it('reports a turn that ended while no daemon was there to see it', async () => {
		const dir = turnsDir();
		runTurn(slow, 'claude', options, () => {}, join(dir, 'w')).detach();
		await wait(1300);

		const after: AgentEvent[] = [];
		const turns = await resumeTurns(dir, adapterFor, () => (e) => after.push(e));
		await turns.get('w')!.done;
		expect(after).toEqual([
			{ kind: 'text', text: 'one' },
			{ kind: 'text', text: 'two' },
			{ kind: 'turn.completed' }
		]);
	});

	it('can still stop a turn it picked up', async () => {
		const dir = turnsDir();
		runTurn(
			fake('setTimeout(() => {}, 10000)'),
			'claude',
			options,
			() => {},
			join(dir, 'w')
		).detach();

		const after: AgentEvent[] = [];
		const turns = await resumeTurns(dir, adapterFor, () => (e) => after.push(e));
		turns.get('w')!.stop();
		await turns.get('w')!.done;
		expect(after).toEqual([{ kind: 'turn.failed', error: 'Stopped' }]);
	});
});
