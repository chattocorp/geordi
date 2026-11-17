import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@geordi/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import type { Meta } from './host.ts';
import { resumeSessions, startSession, type Session } from './session.ts';

/**
 * A stand-in for `claude`, speaking enough of its stream-json protocol: what it does is
 * decided by what it is told. The real host and the real Claude dialogue run it.
 */
const CLI = `#!${process.execPath}
const out = (line) => console.log(JSON.stringify(line));
const init = () => out({ type: 'system', subtype: 'init', session_id: 'cli-1' });
const text = (text) => out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const done = () => out({ type: 'result', subtype: 'success', is_error: false });
let slow = false;
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
	const told = JSON.parse(line);
	if (told.type === 'control_request') {
		out({ type: 'control_response', response: { subtype: 'success', request_id: told.request_id } });
		if (slow) out({ type: 'result', subtype: 'error_during_execution', is_error: true });
		slow = false;
	} else if (told.type === 'control_response') {
		const { answers } = told.response.response.updatedInput;
		text('You said ' + Object.values(answers).join(' and '));
		done();
	} else if (slow) {
		// in the middle of a turn: it steers
		slow = false;
		text('Steered: ' + told.message.content);
		done();
	} else {
		const said = told.message.content;
		if (said === 'crash') process.exit(3);
		init();
		if (said === 'slow') slow = true;
		else if (said === 'ask') {
			const questions = [{ question: 'Tea or coffee?', options: [{ label: 'Tea' }, { label: 'Coffee' }] }];
			const request = { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions } };
			out({ type: 'control_request', request_id: 'q-1', request });
		} else if (said === 'background') {
			out({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1' }] });
			text('started');
			done();
			setTimeout(() => {
				out({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
				init();
				text('it finished');
				done();
			}, 700);
		} else {
			console.log('not json');
			text('Heard: ' + said);
			done();
		}
	}
}).on('close', () => setTimeout(() => process.exit(0), Number(process.env.LINGER ?? 0)));
`;

const bin = mkdtempSync(join(tmpdir(), 'geordi-cli-'));
writeFileSync(join(bin, 'claude'), CLI);
chmodSync(join(bin, 'claude'), 0o755);

const root = () => mkdtempSync(join(tmpdir(), 'geordi-sessions-'));
const meta = (env: Record<string, string> = {}): Meta => ({
	agent: 'claude',
	options: {
		sessionId: 's',
		dir: '',
		cwd: process.cwd(),
		writableRoots: [],
		resumeId: null,
		api: null,
		settings: {},
		env: { PATH: bin, ...env }
	}
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(what: () => boolean, ms = 8000) {
	for (const end = Date.now() + ms; !what();) {
		if (Date.now() > end) throw new Error('That took too long');
		await sleep(20);
	}
}

const started: Session[] = [];
afterAll(() => started.forEach((session) => session.kill()));

/** A session with what it has reported so far, and a way to wait for a report. */
function begin(
	prompt: string,
	{
		env = {},
		dir = join(root(), 'w'),
		ready = () => true,
		idle = ''
	}: { env?: Record<string, string>; dir?: string; ready?: () => boolean; idle?: string } = {}
) {
	const events: AgentEvent[] = [];
	// how long a CLI with nothing to do is kept is the host's to know, from its environment
	if (idle) process.env.GEORDI_SESSION_IDLE_MS = idle;
	const session = startSession(meta(env), { prompt }, (event) => events.push(event), dir, ready);
	delete process.env.GEORDI_SESSION_IDLE_MS;
	started.push(session);
	const kinds = () => events.map((event) => event.kind);
	const ended = (turns: number) =>
		until(
			() =>
				kinds().filter((kind) => kind.startsWith('turn.') && kind !== 'turn.started').length >=
				turns
		);
	return { session, events, kinds, ended, dir };
}

describe('a session', () => {
	it('runs a turn for what it is told, and another in the same CLI for the next thing', async () => {
		const { session, events, ended } = begin('hello');
		await ended(1);
		expect(events).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'resume', id: 'cli-1' },
			{ kind: 'text', text: 'Heard: hello' },
			{ kind: 'turn.completed' }
		]);
		expect(session.working()).toBe(false);
		expect(session.over()).toBe(false);
		expect(session.resumeId()).toBe('cli-1');

		session.say({ prompt: 'again' });
		expect(session.working()).toBe(true); // before any word of it has come back
		await ended(2);
		expect(events.slice(4)).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'text', text: 'Heard: again' },
			{ kind: 'turn.completed' }
		]);
	});

	it('steers a turn under way with what is said meanwhile', async () => {
		const { session, events, kinds, ended } = begin('slow');
		await until(() => kinds().includes('resume'));
		session.say({ prompt: 'not that' });
		await ended(1);
		expect(events.slice(2)).toEqual([
			{ kind: 'text', text: 'Steered: not that' },
			{ kind: 'turn.completed' }
		]);
	});

	it('stops a turn and goes on running, to be told what to do instead', async () => {
		const { session, events, kinds, ended } = begin('slow');
		await until(() => kinds().includes('resume'));
		session.stop();
		await ended(1);
		expect(events.at(-1)).toEqual({ kind: 'turn.failed', error: 'Stopped' });
		expect(session.over()).toBe(false);

		session.say({ prompt: 'this instead' });
		await ended(2);
		expect(events.slice(-2)).toEqual([
			{ kind: 'text', text: 'Heard: this instead' },
			{ kind: 'turn.completed' }
		]);
	});

	it('reports a turn the agent begins by itself, and is not ended while something runs', async () => {
		const { session, events, ended } = begin('background', { idle: '200' });
		await ended(2);
		expect(events.slice(4)).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'text', text: 'it finished' },
			{ kind: 'turn.completed' }
		]);
		// with nothing running any more, and nothing to do, its CLI is ended
		expect(await session.done).toEqual([]);
		expect(session.over()).toBe(true);
	});

	it('passes on what the agent asks, and the answer', async () => {
		const { session, events, kinds, ended } = begin('ask');
		await until(() => kinds().includes('question'));
		expect(events.at(-1)).toEqual({
			kind: 'question',
			id: 'q-1',
			questions: [
				{
					question: 'Tea or coffee?',
					options: [{ label: 'Tea' }, { label: 'Coffee' }],
					multiSelect: false
				}
			]
		});
		session.answer('q-1', ['Coffee']);
		await ended(1);
		expect(events.at(-2)).toEqual({ kind: 'text', text: 'You said Coffee' });
	});

	it('keeps what is said too late for a CLI that is being ended, for the next one', async () => {
		const { session, ended } = begin('hello', { idle: '300', env: { LINGER: '1500' } });
		await ended(1);
		await sleep(900); // idle for long enough: told to end, and taking its time
		session.say({ prompt: 'one more thing' });
		expect(await session.done).toEqual([{ prompt: 'one more thing' }]);
	});
});

describe('a session that goes wrong', () => {
	it('fails the turn when the CLI exits in the middle of it', async () => {
		const { session, events } = begin('crash');
		await session.done;
		expect(events).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'turn.failed', error: 'claude exited with code 3' }
		]);
	});

	it('fails the turn when the CLI does not exist', async () => {
		const { session, events } = begin('hello', { env: { PATH: root() } });
		await session.done;
		expect(events.at(-1)).toMatchObject({ kind: 'turn.failed' });
		expect(JSON.stringify(events.at(-1))).toContain('Failed to start claude');
	});

	it('ends for good when killed, and says the turn was stopped', async () => {
		const { session, events, kinds, dir } = begin('slow');
		await until(() => kinds().includes('resume'));
		session.kill();
		await session.done;
		expect(events.at(-1)).toEqual({ kind: 'turn.failed', error: 'Stopped' });
		expect(existsSync(dir)).toBe(false);
	});
});

describe('with nobody to report to', () => {
	it("keeps everything in the session's files until there is", async () => {
		let connected = false;
		const { events, ended, dir } = begin('hello', { ready: () => connected });
		await until(() => readFileSync(join(dir, 'out.jsonl'), 'utf8').includes('turn.completed'));
		expect(events).toEqual([]);
		connected = true;
		await ended(1);
		expect(events).toHaveLength(4);
	});
});

describe('a daemon restart', () => {
	it('leaves the agent working, and the next daemon carries on where the last one left off', async () => {
		const sessions = root();
		const first = begin('slow', { dir: join(sessions, 'w') });
		await until(() => first.kinds().includes('resume'));
		first.session.detach(); // the daemon goes away

		const events: AgentEvent[] = [];
		const session = resumeSessions(sessions, () => (event) => events.push(event)).get('w')!;
		started.push(session);
		expect(session.working()).toBe(true); // it knows a turn is under way
		expect(session.resumeId()).toBe('cli-1');
		session.say({ prompt: 'still there?' });
		await until(() => events.some((event) => event.kind === 'turn.completed'));
		// nothing is said twice
		expect(events).toEqual([
			{ kind: 'text', text: 'Steered: still there?' },
			{ kind: 'turn.completed' }
		]);
	});

	it('reports a turn that ended while no daemon was there to see it', async () => {
		const sessions = root();
		const first = begin('hello', { dir: join(sessions, 'w'), ready: () => false });
		await until(() =>
			readFileSync(join(first.dir, 'out.jsonl'), 'utf8').includes('turn.completed')
		);
		first.session.detach();

		const events: AgentEvent[] = [];
		const session = resumeSessions(sessions, () => (event) => events.push(event)).get('w')!;
		started.push(session);
		expect(session.working()).toBe(true); // as far as anyone was told
		await until(() => events.length === 4);
		expect(session.working()).toBe(false);
	});

	it("does not take somebody else's process for the session's, nor signal it", async () => {
		const sessions = root();
		const first = begin('slow', { dir: join(sessions, 'w') });
		await until(() => first.kinds().includes('resume'));
		first.session.detach();
		// after a reboot, say: the ID is somebody else's now (ours), started at another time
		const host = join(first.dir, 'host.json');
		const real = JSON.parse(readFileSync(host, 'utf8'));
		writeFileSync(host, JSON.stringify({ pid: process.pid, started: 'long ago' }));

		const events: AgentEvent[] = [];
		const session = resumeSessions(sessions, () => (event) => events.push(event)).get('w')!;
		session.kill(); // must not reach us
		await session.done;
		expect(events).toEqual([{ kind: 'turn.failed', error: 'Stopped' }]);
		process.kill(-real.pid, 'SIGKILL'); // the real one, which nobody follows any more
	});
});
