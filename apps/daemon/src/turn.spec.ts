import type { SessionEvent } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import type { AgentAdapter } from './agents/adapter.ts';
import { runTurn } from './turn.ts';

/** An adapter that runs a Node one-liner and passes its JSON lines through as events. */
const fake = (script: string): AgentAdapter => ({
	command: () => ({ cmd: process.execPath, args: ['-e', script] }),
	parse: (line) => [line as SessionEvent]
});

const options = {
	sessionId: 's',
	prompt: '',
	cwd: process.cwd(),
	writableRoots: [],
	resumeId: null,
	api: null
};

async function collect(adapter: AgentAdapter) {
	const events: SessionEvent[] = [];
	await runTurn(adapter, options, (e) => events.push(e)).done;
	return events;
}

describe('runTurn', () => {
	it('passes events through and ends once', async () => {
		const events = await collect(
			fake(`
				console.log(JSON.stringify({ kind: 'text', text: 'hi' }));
				console.log('not json');
				console.log(JSON.stringify({ kind: 'turn.completed' }));
			`)
		);
		expect(events).toEqual([{ kind: 'text', text: 'hi' }, { kind: 'turn.completed' }]);
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
			{ kind: 'turn.failed', error: expect.stringMatching(/Failed to start/) }
		]);
	});

	it('reports stopped turns', async () => {
		const events: SessionEvent[] = [];
		const turn = runTurn(fake('setTimeout(() => {}, 10000)'), options, (e) => events.push(e));
		turn.stop();
		await turn.done;
		expect(events).toEqual([{ kind: 'turn.failed', error: 'Stopped' }]);
	});
});
