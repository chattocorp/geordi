import type { AgentEvent } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import type { Dialogue, SessionOptions } from './adapter.ts';
import { claude } from './claude.ts';

const options: SessionOptions = {
	sessionId: 'abc',
	dir: '/sessions/abc',
	cwd: '/w',
	writableRoots: ['/r/.git/objects'],
	resumeId: null,
	api: { url: 'http://forge/mcp' },
	settings: {}
};

const readAll = (dialogue: Dialogue, lines: unknown[]): AgentEvent[] =>
	lines.flatMap((line) => dialogue.read(line).events ?? []);
const written = (lines: string[] = []) => lines.map((line) => JSON.parse(line));

// Lines as `claude -p --output-format stream-json` (2.1) writes them, cut down to what matters.
const init = {
	type: 'system',
	subtype: 'init',
	session_id: 's1',
	permissionMode: 'bypassPermissions'
};
const success = { type: 'result', subtype: 'success', is_error: false, result: 'It says hello.' };
const asks = {
	type: 'control_request',
	request_id: 'd8403c55',
	request: {
		subtype: 'can_use_tool',
		tool_name: 'AskUserQuestion',
		display_name: 'AskUserQuestion',
		input: {
			questions: [
				{
					question: 'Which colour do you prefer?',
					header: 'Colour',
					options: [
						{ label: 'Red', description: 'Red' },
						{ label: 'Teal', description: 'Teal' }
					],
					multiSelect: false
				}
			]
		},
		tool_use_id: 'toolu_013J',
		requires_user_interaction: true
	}
};

describe('what Claude writes', () => {
	it('is a turn, from its beginning to its end', () => {
		const events = readAll(claude.dialogue(options), [
			{ type: 'system', subtype: 'hook_started', session_id: 's1' },
			init,
			{
				type: 'assistant',
				message: {
					content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.txt' } }]
				}
			},
			{ type: 'rate_limit_event' },
			{
				type: 'user',
				message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '1\thello' }] }
			},
			{ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '' }] } },
			{ type: 'assistant', message: { content: [{ type: 'text', text: 'It says hello.' }] } },
			success
		]);

		expect(events).toEqual([
			{ kind: 'resume', id: 's1' },
			{ kind: 'turn.started' },
			{ kind: 'tool', id: 't1', name: 'Read', input: '{"file_path":"a.txt"}' },
			{ kind: 'tool.result', id: 't1', output: '1\thello', isError: false },
			{ kind: 'text', text: 'It says hello.' },
			{ kind: 'turn.completed' }
		]);
	});

	it('begins a turn with every `init`, also one Claude begins by itself, and names the session once', () => {
		const dialogue = claude.dialogue(options);
		readAll(dialogue, [init, success]);
		// something it ran in the background has finished: it reports, unasked
		const events = readAll(dialogue, [
			{ type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'completed' },
			{ type: 'system', subtype: 'background_tasks_changed', tasks: [] },
			init,
			{ type: 'assistant', message: { content: [{ type: 'text', text: 'It printed bgdone.' }] } },
			success
		]);
		expect(events).toEqual([
			{ kind: 'turn.started' },
			{ kind: 'text', text: 'It printed bgdone.' },
			{ kind: 'turn.completed' }
		]);
	});

	it('has something running while it has background tasks', () => {
		const dialogue = claude.dialogue(options);
		expect(dialogue.busy()).toBe(false);
		const task = { task_id: 'bunjfl7ef', task_type: 'local_bash', description: 'Sleep' };
		dialogue.read({ type: 'system', subtype: 'background_tasks_changed', tasks: [task] });
		expect(dialogue.busy()).toBe(true);
		dialogue.read({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
		expect(dialogue.busy()).toBe(false);
	});

	it('fails a turn that ended in an error, with what it says of it', () => {
		const read = (line: object) => claude.dialogue(options).read(line).events;
		expect(read({ type: 'result', subtype: 'error_max_turns', is_error: true })).toEqual([
			{ kind: 'turn.failed', error: 'error_max_turns' }
		]);
		// an interrupted turn
		const errors = ['[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use'];
		expect(
			read({ type: 'result', subtype: 'error_during_execution', is_error: true, errors })
		).toEqual([{ kind: 'turn.failed', error: errors[0] }]);
	});

	it("does not pass a skill's instructions off as something the agent said", () => {
		// the shape `claude -p` reports a skill being read in: the tool call, its result, and
		// then the skill's text as a user message for the model
		const events = readAll(claude.dialogue(options), [
			{
				type: 'assistant',
				message: {
					content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'review' } }]
				}
			},
			{
				type: 'user',
				message: {
					content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Launching skill: review' }]
				}
			},
			{
				type: 'user',
				message: {
					content: [
						{
							type: 'text',
							text: 'Base directory for this skill: /wt/.claude/skills/review\n\n# Review'
						}
					]
				}
			},
			{ type: 'assistant', message: { content: [{ type: 'text', text: 'Reviewing now.' }] } }
		]);

		expect(events).toEqual([
			{ kind: 'tool', id: 't1', name: 'Skill', input: '{"skill":"review"}' },
			{ kind: 'tool.result', id: 't1', output: 'Launching skill: review', isError: false },
			{ kind: 'text', text: 'Reviewing now.' }
		]);
	});
});

describe('a question Claude asks', () => {
	// the tool call, the request for permission to use it (which is how the question reaches
	// us), and, once that is answered, the tool's result
	const call = {
		type: 'assistant',
		message: {
			content: [
				{ type: 'tool_use', id: 'toolu_013J', name: 'AskUserQuestion', input: asks.request.input }
			]
		}
	};
	const result = {
		type: 'user',
		message: {
			content: [
				{
					type: 'tool_result',
					tool_use_id: 'toolu_013J',
					content: 'User has answered your questions'
				}
			]
		}
	};

	it('is shown as a question, not as a tool call', () => {
		expect(readAll(claude.dialogue(options), [call, asks, result])).toEqual([
			{
				kind: 'question',
				id: 'd8403c55',
				questions: [
					{
						question: 'Which colour do you prefer?',
						header: 'Colour',
						options: [
							{ label: 'Red', description: 'Red' },
							{ label: 'Teal', description: 'Teal' }
						],
						multiSelect: false
					}
				]
			}
		]);
	});

	it('is answered by allowing the tool, with the answers by question', () => {
		const dialogue = claude.dialogue(options);
		readAll(dialogue, [call, asks]);
		expect(written(dialogue.answer('d8403c55', ['Teal']).write)).toEqual([
			{
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: 'd8403c55',
					response: {
						behavior: 'allow',
						updatedInput: {
							questions: asks.request.input.questions,
							answers: { 'Which colour do you prefer?': 'Teal' }
						}
					}
				}
			}
		]);
		// once: there is nothing left to answer
		expect(dialogue.answer('d8403c55', ['Red'])).toEqual({});
		expect(dialogue.answer('never-asked', ['Red'])).toEqual({});
	});

	it('waits for no answer once the turn is over', () => {
		const dialogue = claude.dialogue(options);
		readAll(dialogue, [
			call,
			asks,
			{ type: 'result', subtype: 'error_during_execution', is_error: true }
		]);
		expect(dialogue.answer('d8403c55', ['Teal'])).toEqual({});
	});

	it('is the only thing anyone is asked: other requests for permission are refused at once', () => {
		const request = { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -rf /' } };
		const { write, events } = claude
			.dialogue(options)
			.read({ type: 'control_request', request_id: 'r1', request });
		expect(events).toBeUndefined();
		expect(written(write)).toMatchObject([
			{
				type: 'control_response',
				response: { subtype: 'success', request_id: 'r1', response: { behavior: 'deny' } }
			}
		]);
	});
});

describe('what Claude is told', () => {
	it('is a user message: plain words, or pictures and words', () => {
		const dialogue = claude.dialogue(options);
		expect(written(dialogue.message('--print this', []).write)).toMatchObject([
			{ type: 'user', message: { role: 'user', content: '--print this' } }
		]);
		const image = { mediaType: 'image/png' as const, data: 'aGVsbG8=' };
		expect(written(dialogue.message('Look', [image]).write)).toMatchObject([
			{
				type: 'user',
				message: {
					role: 'user',
					content: [
						{
							type: 'image',
							source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' }
						},
						{ type: 'text', text: 'Look' }
					]
				}
			}
		]);
	});

	it('is asked to stop a turn with a control request, and to forget what it has not read yet', () => {
		const dialogue = claude.dialogue(options);
		const [first] = written(dialogue.message('Do this', []).write);
		dialogue.read(init); // the turn that message began: it was read
		const [second] = written(dialogue.message('And that', []).write);
		expect(first.uuid).not.toBe(second.uuid);
		// said during the turn: left alone, it would start a turn of its own after the stop
		expect(written(dialogue.interrupt().write)).toMatchObject([
			{ type: 'control_request', request: { subtype: 'interrupt' } },
			{
				type: 'control_request',
				request: { subtype: 'cancel_async_message', message_uuid: second.uuid }
			}
		]);
		expect(dialogue.interrupt().write).toHaveLength(1);
	});
});

describe('how Claude is started', () => {
	const args = (over: Partial<SessionOptions> = {}) => claude.command({ ...options, ...over }).args;

	it('to be talked to for as long as it runs, asking us what it would ask a person', () => {
		const joined = args().join(' ');
		expect(joined).toContain('-p --input-format stream-json --output-format stream-json');
		expect(joined).toContain('--permission-prompt-tool stdio');
	});

	it('with our session ID, or resuming the CLI one', () => {
		expect(args().slice(-2)).toEqual(['--session-id', 'abc']);
		expect(args({ resumeId: 'r1' }).slice(-2)).toEqual(['--resume', 'r1']);
	});

	it('with the model and effort that were chosen, or neither', () => {
		expect(args({ settings: { model: 'opus', effort: 'high' } }).join(' ')).toContain(
			'--model opus --effort high'
		);
		expect(args().join(' ')).not.toMatch(/--model|--effort/);
	});

	it('with what Geordi has to tell the agent, and its agent API', () => {
		const instructions = 'You are working inside Geordi.\n\nIt has "tools".';
		const given = args({ instructions });
		expect(given[given.indexOf(instructions) - 1]).toBe('--append-system-prompt');
		const servers = JSON.parse(given[given.indexOf('--mcp-config') + 1]);
		expect(servers.mcpServers.geordi).toMatchObject({ type: 'http', url: 'http://forge/mcp' });
		expect(args({ api: null })).not.toContain('--mcp-config');
	});
});
