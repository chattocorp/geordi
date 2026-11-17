import { readFileSync } from 'node:fs';
import type { AgentEvent, MessageImage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import type { Dialogue, SessionOptions, Step } from './adapter.ts';
import { codex, modelsIn } from './codex.ts';

const options: SessionOptions = {
	sessionId: 'abc',
	dir: '/sessions/abc',
	cwd: '/w',
	writableRoots: ['/r/.git/objects'],
	resumeId: null,
	api: { url: 'http://forge/mcp' },
	settings: {}
};

type Sent = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown };

/** A conversation as the host would have it: what reached Codex, and what was told of it. */
function session(given: Partial<SessionOptions> = {}) {
	const dialogue: Dialogue = codex.dialogue({ ...options, ...given });
	const sent: Sent[] = [];
	const events: AgentEvent[] = [];
	let open = false;
	function apply({ write = [], events: happened = [] }: Step) {
		sent.push(...write.map((line) => JSON.parse(line)));
		// as the host does: a turn under way does not start again, and only one that is can end
		for (const event of happened) {
			if (event.kind === 'turn.started') {
				if (open) continue;
				open = true;
			} else if (event.kind === 'turn.completed' || event.kind === 'turn.failed') {
				if (!open) continue;
				open = false;
			}
			events.push(event);
		}
	}
	apply({ write: dialogue.open?.() });
	return {
		sent,
		events,
		read: (line: unknown) => apply(dialogue.read(line)),
		message(prompt: string, images: MessageImage[] = []) {
			apply({ events: [{ kind: 'turn.started' }] });
			apply(dialogue.message(prompt, images));
		},
		interrupt: () => apply(dialogue.interrupt()),
		answer: (id: string, answers: string[]) => apply(dialogue.answer(id, answers))
	};
}

/**
 * Plays back what was recorded of a real `codex app-server` (0.169.0), driven through this
 * adapter: `do` is what the host was told then, `read` a line Codex wrote. Notifications
 * about the account and its own MCP servers were left out, and the home directory renamed.
 */
function replay(name: string, given: Partial<SessionOptions> = {}) {
	const played = session(given);
	const lines = readFileSync(new URL(`./codex.fixtures/${name}.jsonl`, import.meta.url), 'utf8');
	for (const line of lines.split('\n').filter(Boolean)) {
		const step = JSON.parse(line) as
			| { do: ['message', string, MessageImage[]] | ['interrupt'] | ['answer', string, string[]] }
			| { read: unknown; do?: undefined };
		if (!step.do) played.read(step.read);
		else if (step.do[0] === 'message') played.message(step.do[1], step.do[2]);
		else if (step.do[0] === 'interrupt') played.interrupt();
		else played.answer(step.do[1], step.do[2]);
	}
	return played;
}

const methods = (sent: Sent[]) => sent.map((message) => message.method ?? 'response');

// Answers and notifications as Codex writes them, cut down to what matters.
const thread = { id: 2, result: { thread: { id: 't1' } } };
const turn = (request: number, id: string) => ({ id: request, result: { turn: { id } } });
const turnCompleted = (id: string, status = 'completed') => ({
	method: 'turn/completed',
	params: { threadId: 't1', turn: { id, items: [], status, error: null } }
});
const refused = (id: number, message: string) => ({ id, error: { code: -32600, message } });

describe('codex adapter', () => {
	it('runs a plain turn, holding what is said until the thread is there', () => {
		const { sent, events } = replay('plain', {
			settings: { model: 'gpt-5.6-luna', effort: 'low' }
		});

		expect(methods(sent)).toEqual(['initialize', 'initialized', 'thread/start', 'turn/start']);
		expect(sent[2].params).toMatchObject({
			cwd: '/w',
			model: 'gpt-5.6-luna',
			approvalPolicy: 'never',
			sandbox: 'danger-full-access'
		});
		expect(sent[3].params).toEqual({
			threadId: '01a1eab4-e230-7c41-9418-3468b148ce67',
			input: [{ type: 'text', text: 'Reply with exactly: hello there' }],
			effort: 'low'
		});
		expect(events).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'resume', id: '01a1eab4-e230-7c41-9418-3468b148ce67' },
			{ kind: 'text', text: 'hello there' },
			{ kind: 'turn.completed' }
		]);
	});

	it('shows shell commands as they start and end', () => {
		const { events } = replay('shell');
		const id = 'exec-df03fb14-ad5a-4b0f-93df-df265aee2bc7';

		expect(events.slice(2)).toEqual([
			{
				kind: 'tool',
				id,
				name: 'shell',
				input: "/bin/zsh -lc 'echo geordi-was-here; ls /nonexistent-dir-xyz'"
			},
			{
				kind: 'tool.result',
				id,
				output: 'geordi-was-here\nls: /nonexistent-dir-xyz: No such file or directory\n',
				isError: true
			},
			{
				kind: 'text',
				text: 'The command printed `geordi-was-here`, then `ls` failed because the directory does not exist.'
			},
			{ kind: 'turn.completed' }
		]);
	});

	it('shows file changes as edits', () => {
		const { events } = replay('edit');
		const id = 'exec-c0a7d75e-bb73-4d18-9b3e-dfc068b58bee';
		const summary = 'add /tmp/codex-drive/work2/note.txt';

		expect(events.slice(2)).toEqual([
			{ kind: 'tool', id, name: 'edit', input: summary },
			{ kind: 'tool.result', id, output: summary, isError: false },
			{ kind: 'text', text: 'done' },
			{ kind: 'turn.completed' }
		]);
	});

	it('names MCP calls like Claude does', () => {
		const { events } = replay('mcp');
		const id = 'exec-5d095c9e-49a6-4d3d-94ad-a82b5f156c64';

		expect(events.slice(3, 5)).toEqual([
			{ kind: 'tool', id, name: 'mcp__geordi__name_workspace', input: '{"name":"codex test"}' },
			{ kind: 'tool.result', id, output: 'Named: codex test', isError: false }
		]);
	});

	it('steers the turn under way with what is said during it', () => {
		const { sent, events } = replay('steer');

		expect(methods(sent).slice(3)).toEqual(['turn/start', 'turn/steer']);
		expect(sent[4].params).toEqual({
			threadId: '01a1eab5-1d99-7672-8f00-4d1da8fa788c',
			expectedTurnId: (sent[4].params as { expectedTurnId: string }).expectedTurnId,
			input: [
				{
					type: 'text',
					text: 'Change of plan: when the command is done, reply with the single word "steered" instead.'
				}
			]
		});
		expect(sent[4].params?.expectedTurnId).toMatch(/^01a1eab5-/);
		// one turn, which ends as the second message asked
		expect(events.filter((event) => event.kind === 'turn.started')).toHaveLength(1);
		expect(events.slice(-2)).toEqual([
			{ kind: 'text', text: 'steered' },
			{ kind: 'turn.completed' }
		]);
	});

	it('interrupts a turn, ends the command it was in, and goes on in the same thread', () => {
		const { sent, events } = replay('interrupt');
		const id = 'exec-2b28e346-c9d3-410b-92d7-3db34b3f6435';

		expect(methods(sent).slice(3)).toEqual(['turn/start', 'turn/interrupt', 'turn/start']);
		expect(sent[4].params).toMatchObject({ threadId: '01a1eab5-1d32-71d0-8dd9-7ad08289a59d' });
		expect(events.slice(3)).toEqual([
			{ kind: 'tool', id, name: 'shell', input: "/bin/zsh -lc 'sleep 60 && echo slept'" },
			// Codex itself says nothing more of it
			{ kind: 'tool.result', id, output: '', isError: true },
			{ kind: 'turn.failed', error: 'Interrupted' },
			{ kind: 'turn.started' },
			{ kind: 'text', text: 'still here' },
			{ kind: 'turn.completed' }
		]);
	});

	it('takes up a thread again', () => {
		const resumeId = '01a1eab4-e230-7c41-9418-3468b148ce67';
		const { sent, events } = replay('resume', { resumeId, instructions: 'Be brief.' });

		expect(methods(sent)).toEqual(['initialize', 'initialized', 'thread/resume', 'turn/start']);
		expect(sent[2].params).toEqual({
			threadId: resumeId,
			excludeTurns: true,
			cwd: '/w',
			developerInstructions: 'Be brief.',
			approvalPolicy: 'never',
			sandbox: 'danger-full-access'
		});
		expect(events).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'resume', id: resumeId },
			{ kind: 'text', text: 'hello there' },
			{ kind: 'turn.completed' }
		]);
	});

	it('fails the turn when the thread to take up is not there, and every one after', () => {
		const played = replay('unknown', { resumeId: '00000000-0000-7000-8000-000000000000' });
		const error = 'no rollout found for thread id 00000000-0000-7000-8000-000000000000';

		expect(methods(played.sent)).toEqual(['initialize', 'initialized', 'thread/resume']);
		expect(played.events).toEqual([{ kind: 'turn.started' }, { kind: 'turn.failed', error }]);

		played.message('Anyone?');
		expect(methods(played.sent)).toHaveLength(3);
		expect(played.events.slice(2)).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'turn.failed', error }
		]);
	});

	it('fails the turn with what Codex says went wrong in it', () => {
		const { events } = replay('nomodel', { settings: { model: 'no-such-model-xyz' } });

		expect(events.slice(2)).toEqual([
			{
				kind: 'turn.failed',
				error:
					"The 'no-such-model-xyz' model is not supported when using Codex with a ChatGPT account."
			}
		]);
	});

	it('fails the turn when Codex refuses to start it, and starts the next all the same', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');
		played.read(refused(3, 'thread not found: t1'));
		expect(played.events).toEqual([
			{ kind: 'resume', id: 't1' },
			{ kind: 'turn.started' },
			{ kind: 'turn.failed', error: 'thread not found: t1' }
		]);

		played.message('Again');
		expect(methods(played.sent).slice(3)).toEqual(['turn/start', 'turn/start']);
	});

	it('passes on a question, and the answer by the question’s own ID', () => {
		const { sent, events } = replay('question');

		expect(events[2]).toEqual({
			kind: 'question',
			id: '0',
			questions: [
				{
					question: 'Which colour do you prefer?',
					header: 'Colour',
					options: [
						{ label: 'Red (Recommended)', description: 'Choose red.' },
						{ label: 'Blue', description: 'Choose blue.' }
					],
					multiSelect: false
				}
			]
		});
		// the request's ID as Codex gave it: a number
		expect(sent[4]).toEqual({
			id: 0,
			result: { answers: { preferred_colour: { answers: ['Blue'] } } }
		});
		expect(events.slice(3)).toEqual([{ kind: 'text', text: 'Blue' }, { kind: 'turn.completed' }]);
	});

	it('answers a question once, and none of a turn that is over', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');
		played.read(turn(3, 'u1'));
		const params = { threadId: 't1', questions: [{ id: 'q', header: 'Q', question: 'Well?' }] };
		played.read({ id: 7, method: 'item/tool/requestUserInput', params });
		expect(played.events.at(-1)).toEqual({
			kind: 'question',
			id: '7',
			questions: [{ question: 'Well?', header: 'Q', options: [], multiSelect: false }]
		});
		played.answer('7', ['Yes']);
		played.answer('7', ['No']);
		expect(played.sent.slice(4)).toEqual([
			{ id: 7, result: { answers: { q: { answers: ['Yes'] } } } }
		]);

		played.read({ id: 8, method: 'item/tool/requestUserInput', params });
		played.read(turnCompleted('u1'));
		played.answer('8', ['Yes']);
		expect(played.sent).toHaveLength(5);
	});

	it('sends pictures along as data URLs', () => {
		const { sent, events } = replay('image');
		const [picture, text] = (sent[3].params as { input: { type: string; url?: string }[] }).input;

		expect(picture.type).toBe('image');
		expect(picture.url).toMatch(/^data:image\/png;base64,iVBOR/);
		expect(text).toEqual({
			type: 'text',
			text: 'What single colour fills this picture? One word.'
		});
		expect(events.slice(2)).toEqual([{ kind: 'text', text: 'Red' }, { kind: 'turn.completed' }]);
	});

	it('starts a turn with what could not steer one that had just ended', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');
		played.read(turn(3, 'u1'));
		played.message('And another thing');
		played.read(turnCompleted('u1'));
		played.read(refused(4, 'no active turn to steer'));

		expect(methods(played.sent).slice(3)).toEqual(['turn/start', 'turn/steer', 'turn/start']);
		expect(played.sent[5].params).toMatchObject({
			input: [{ type: 'text', text: 'And another thing' }]
		});
		expect(played.events.slice(1)).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'turn.completed' },
			{ kind: 'turn.started' }
		]);
	});

	it('keeps what a turn would not be steered with for the next one', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');
		played.read(turn(3, 'u1'));
		played.message('And another thing');
		played.read(refused(4, 'cannot steer a review turn'));
		expect(methods(played.sent).slice(3)).toEqual(['turn/start', 'turn/steer']);

		played.read(turnCompleted('u1'));
		expect(methods(played.sent).slice(5)).toEqual(['turn/start']);
		expect(played.events.slice(-2)).toEqual([{ kind: 'turn.completed' }, { kind: 'turn.started' }]);
	});

	it('says several things held back as one turn', () => {
		const played = session();
		played.message('One');
		played.message('Two');
		played.read(thread);

		expect(methods(played.sent).slice(3)).toEqual(['turn/start']);
		expect(played.sent[3].params).toEqual({
			threadId: 't1',
			input: [
				{ type: 'text', text: 'One' },
				{ type: 'text', text: 'Two' }
			]
		});
	});

	it('stops a turn that has no name yet as soon as it has one', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');
		played.interrupt();
		expect(methods(played.sent).slice(3)).toEqual(['turn/start']);

		played.read(turn(3, 'u1'));
		expect(played.sent[4]).toEqual({
			id: 4,
			method: 'turn/interrupt',
			params: { threadId: 't1', turnId: 'u1' }
		});
		played.read(turnCompleted('u1', 'interrupted'));
		expect(played.events.at(-1)).toEqual({ kind: 'turn.failed', error: 'Interrupted' });
	});

	it('drops what was stopped before it reached Codex', () => {
		const played = session();
		played.message('Hello');
		played.interrupt();
		played.read(thread);

		expect(methods(played.sent)).toEqual(['initialize', 'initialized', 'thread/start']);
		expect(played.events).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'turn.failed', error: 'Interrupted' },
			{ kind: 'resume', id: 't1' }
		]);
	});

	it('allows at once whatever Codex asks permission for', () => {
		const played = session();
		played.read(thread);
		const ask = (id: number, method: string, params = {}) => {
			played.read({ id, method, params: { threadId: 't1', ...params } });
			return played.sent.at(-1);
		};
		const permissions = { network: { enabled: true }, fileSystem: null };

		expect(ask(1, 'item/commandExecution/requestApproval')).toEqual({
			id: 1,
			result: { decision: 'accept' }
		});
		expect(ask(2, 'item/fileChange/requestApproval')).toEqual({
			id: 2,
			result: { decision: 'accept' }
		});
		expect(ask(3, 'item/permissions/requestApproval', { permissions })).toEqual({
			id: 3,
			result: { permissions }
		});
		expect(ask(4, 'execCommandApproval')).toEqual({ id: 4, result: { decision: 'approved' } });
		expect(ask(5, 'applyPatchApproval')).toEqual({ id: 5, result: { decision: 'approved' } });
		expect(ask(6, 'mcpServer/elicitation/request')).toMatchObject({
			id: 6,
			result: { action: 'accept' }
		});
		// what we cannot do is said, rather than left unanswered
		expect(ask(7, 'item/tool/call')).toMatchObject({ id: 7, error: { code: -32601 } });
		expect(played.events).toEqual([{ kind: 'resume', id: 't1' }]);
	});

	it('leaves out what happens in other threads, and what it said itself', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');
		played.read(turn(3, 'u1'));
		const before = played.events.length;
		const item = { type: 'agentMessage', id: 'm1', text: 'From a subagent' };
		played.read({ method: 'item/completed', params: { threadId: 't2', item } });
		played.read({
			method: 'turn/completed',
			params: { threadId: 't2', turn: { id: 'u9', status: 'completed' } }
		});
		const said = { type: 'userMessage', id: 'm2', content: [{ type: 'text', text: 'Hello' }] };
		played.read({ method: 'item/completed', params: { threadId: 't1', item: said } });
		played.read({
			method: 'item/completed',
			params: { threadId: 't1', item: { type: 'reasoning', id: 'r1' } }
		});

		expect(played.events).toHaveLength(before);
	});

	it('starts the app server with what a thread cannot be told', () => {
		expect(codex.command(options)).toEqual({
			cmd: 'codex',
			args: [
				'app-server',
				'-c',
				'features.default_mode_request_user_input=true',
				'-c',
				'mcp_servers.geordi.url="http://forge/mcp"',
				'-c',
				'mcp_servers.geordi.bearer_token_env_var="GEORDI_API_TOKEN"'
			]
		});
		expect(codex.command({ ...options, api: null }).args.join(' ')).not.toMatch(/mcp_servers/);
	});

	it('leaves model and effort to Codex when nothing was chosen', () => {
		const played = session();
		played.read(thread);
		played.message('Hello');

		expect(JSON.stringify(played.sent)).not.toMatch(/model|effort/);
	});

	it('reads the models Codex offers from its own list, and survives not finding it', () => {
		const cache = JSON.stringify({
			models: [
				{
					slug: 'gpt-x',
					display_name: 'GPT-X',
					visibility: 'list',
					supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }]
				},
				{ slug: 'internal', visibility: 'hide' },
				{ slug: '--evil', visibility: 'list' }
			]
		});
		expect(modelsIn(cache)).toEqual([{ id: 'gpt-x', name: 'GPT-X', efforts: ['low', 'high'] }]);
		expect(modelsIn('')).toEqual([]);
		expect(modelsIn('{"something":"else"}')).toEqual([]);
	});
});
