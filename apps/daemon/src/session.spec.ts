import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@geordi/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import type { Meta } from './host.ts';
import { resumeSessions, startSession, type Session } from './session.ts';

/** A small ACP peer for the detached host's restart and delivery tests. */
const bin = mkdtempSync(join(tmpdir(), 'geordi-wrapper-'));
const fixture = join(bin, 'fixture.cjs');
writeFileSync(
	fixture,
	`
const out = (msg) => console.log(JSON.stringify({jsonrpc:'2.0', ...msg}));
const id = 'cli-1';
const update = (u) => out({method:'session/update',params:{sessionId:id,update:u}});
const state = (state, extra) => update({sessionUpdate:'state_update',state,...extra});
const text = (text) => update({sessionUpdate:'agent_message',messageId:'answer',content:[{type:'text',text}]});
const done = () => state('idle',{stopReason:'end_turn',background:[]});
let slow = false;
const configOptions=[{configId:'mode',category:'mode',name:'Mode',type:'select',currentValue:'bypassPermissions',options:[{value:'bypassPermissions',name:'Test'}]}];
require('node:readline').createInterface({input:process.stdin}).on('line', line=>{
 const req=JSON.parse(line);
 const result=result=>out({id:req.id,result});
 switch(req.method){
 case 'initialize': return result({protocolVersion:2,info:{name:'fixture',version:'1'},capabilities:{},authMethods:[]});
 case 'session/new': return result({sessionId:id,configOptions});
 case 'session/cancel': slow=false;return state('idle',{stopReason:'cancelled'});
 case 'session/prompt': {
  const said=req.params.prompt[0].text;
  if(said==='crash')process.exit(3);
  state('running');result({messageId:String(req.id)});
  if(slow){slow=false;text('Steered: '+said);return done();}
  if(said==='slow'){slow=true;return;}
  if(said==='ask'){out({id:101,method:'elicitation/create',params:{sessionId:id,mode:'form',message:'Tea or coffee?',requestedSchema:{type:'object',required:['drink'],properties:{drink:{type:'string',title:'Tea or coffee?',enum:['Tea','Coffee']}}}}});return;}
  if(said==='pick'){out({id:102,method:'elicitation/create',params:{sessionId:id,mode:'form',message:'Which drinks?',requestedSchema:{type:'object',properties:{question_0:{type:'array',items:{anyOf:[{const:'Tea',title:'Tea'},{const:'Coffee',title:'Coffee'}]}},question_0_custom:{type:'string'}}}}});return;}
  if(said==='background'){text('started');state('idle',{stopReason:'end_turn',background:[{type:'tool_call',toolCallId:'task'}]});setTimeout(()=>{state('running');text('it finished');done();},700);return;}
  text('Heard: '+said);return done();
 }
 default: if(req.id===102){text(JSON.stringify(req.result.content));done();return;} if(req.id===101){text('You said '+req.result.content.drink);done();}
 }
}).on('close',()=>setTimeout(()=>process.exit(0),Number(process.env.LINGER??0)));
`
);

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
		env
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
	const session = startSession(
		meta(env),
		{ prompt },
		(event) => events.push(event),
		dir,
		ready,
		env.MISSING ? join(bin, 'absent.cjs') : fixture
	);
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

		session.say({ prompt: 'again', deliveryId: 'second' });
		expect(session.working()).toBe(true); // before any word of it has come back
		await ended(2);
		session.say({ prompt: 'again', deliveryId: 'second' });
		expect(session.working()).toBe(false);
		expect(events.slice(4)).toEqual([
			{ kind: 'message.received', id: 'second' },
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
			id: expect.any(String),
			questions: [
				{
					question: 'Tea or coffee?',
					options: [{ label: 'Tea' }, { label: 'Coffee' }],
					multiSelect: false
				}
			]
		});
		const question = events.at(-1)!;
		if (question.kind !== 'question') throw new Error('Missing question');
		session.answer(question.id, ['Coffee']);
		await ended(1);
		expect(events.at(-2)).toEqual({ kind: 'text', text: 'You said Coffee' });
	});

	it.each([
		['Tea\nCoffee', { question_0: ['Tea', 'Coffee'] }],
		['Water', { question_0_custom: 'Water' }]
	])('delivers a Claude multi-select answer %j', async (answer, expected) => {
		const { session, events, kinds, ended } = begin('pick');
		await until(() => kinds().includes('question'));
		const question = events.at(-1)!;
		if (question.kind !== 'question') throw new Error('Missing question');
		expect(question.questions).toHaveLength(1);
		expect(question.questions[0]).toMatchObject({
			question: 'Which drinks?',
			multiSelect: true,
			optional: true
		});
		session.answer(question.id, [answer]);
		await ended(1);
		expect(events.at(-2)).toEqual({ kind: 'text', text: JSON.stringify(expected) });
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
			{ kind: 'resume', id: 'cli-1' },
			{ kind: 'turn.failed', error: expect.any(String) }
		]);
	});

	it('fails the turn when the CLI does not exist', async () => {
		const { session, events } = begin('hello', { env: { MISSING: '1' } });
		await session.done;
		expect(events.at(-1)).toMatchObject({ kind: 'turn.failed' });
		expect(JSON.stringify(events.at(-1))).toMatch(/missing|absent|closed/i);
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
