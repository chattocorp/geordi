import { mkdtempSync } from 'node:fs';
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

describe('a daemon restart', () => {
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
