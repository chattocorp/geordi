import { randomUUID } from 'node:crypto';
import type { AgentEvent, Question } from '@geordi/protocol';
import {
	API_SERVER,
	API_TOKEN_ENV,
	truncate,
	type AgentAdapter,
	type Dialogue,
	type Step
} from './adapter.ts';

/**
 * Agents run unattended and need to commit, push and use `gh`, so by default nothing asks
 * for permission. `auto` or `acceptEdits` restrict that again.
 */
const permissionMode = process.env.GEORDI_CLAUDE_PERMISSION_MODE || 'bypassPermissions';

type Block =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
	| { type: string };

/** A line of `--output-format stream-json`. Fields vary by `type`; we read the ones we know about. */
type Line = {
	type: string;
	subtype?: string;
	session_id?: string;
	message?: { content: Block[] | string };
	/** `result` */
	is_error?: boolean;
	result?: string;
	errors?: string[];
	/** `system` / `background_tasks_changed`: what is running in the background now. */
	tasks?: unknown[];
	/** `control_request`: the CLI asks us something, and waits for a `control_response`. */
	request_id?: string;
	request?: { subtype: string; tool_name?: string; input?: { questions?: Question[] } };
};

/** The tool Claude asks the person things with. It reaches us as a request for permission to use it. */
const ASK = 'AskUserQuestion';

function stringify(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content))
		return content.map((c) => (c?.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
	return JSON.stringify(content);
}

function parseBlock(block: Block): AgentEvent[] {
	if (block.type === 'text' && 'text' in block) return [{ kind: 'text', text: block.text }];
	if (block.type === 'tool_use' && 'name' in block)
		return [{ kind: 'tool', id: block.id, name: block.name, input: JSON.stringify(block.input) }];
	if (block.type === 'tool_result' && 'tool_use_id' in block)
		return [
			{
				kind: 'tool.result',
				id: block.tool_use_id,
				output: truncate(stringify(block.content)),
				isError: block.is_error ?? false
			}
		];
	return []; // thinking blocks etc.
}

/** `--effort` levels, the least first. */
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** The CLI's aliases, each for the latest model of its kind. */
const MODELS = ['Fable', 'Opus', 'Sonnet', 'Haiku'];

const line = (message: unknown) => JSON.stringify(message);

/**
 * Talks to `claude -p` over its `stream-json` input and output, which is what its SDK does:
 * user messages in (at any time: one that arrives during a turn steers it), and control
 * requests both ways (ours to interrupt, its to ask whether a tool may be used).
 */
function dialogue(): Dialogue {
	let sessionId: string | undefined;
	/** How many things run in the background, which Claude starts a turn of its own about when they end. */
	let background = 0;
	/** What Claude has asked and not been answered, by request: the tool's input, to hand back with the answers. */
	const asked = new Map<string, { questions?: Question[] }>();
	/** The messages said since the turn began: those Claude may not have read yet. */
	let said: string[] = [];
	const control = (request: object) =>
		line({ type: 'control_request', request_id: randomUUID(), request });
	/** The calls of the question tool: shown as questions, not as tool calls. */
	const asking = new Set<string>();

	function blocks(content: Block[], own: boolean): AgentEvent[] {
		return content.flatMap((block) => {
			if (block.type === 'tool_use' && 'name' in block && block.name === ASK) {
				asking.add(block.id);
				return [];
			}
			if (block.type === 'tool_result' && 'tool_use_id' in block && asking.has(block.tool_use_id))
				return [];
			// What Claude says is the assistant's. A `user` line carries tool results, and
			// text the CLI hands the model on our behalf (a skill's instructions, say): that
			// is context for the agent, not something it said.
			if (!own && block.type === 'text') return [];
			return parseBlock(block);
		});
	}

	return {
		message: (prompt, images) => ({
			write: [
				line({
					type: 'user',
					uuid: said[said.push(randomUUID()) - 1],
					message: {
						role: 'user',
						content: images.length
							? [
									...images.map((image) => ({
										type: 'image',
										source: { type: 'base64', media_type: image.mediaType, data: image.data }
									})),
									...(prompt ? [{ type: 'text', text: prompt }] : [])
								]
							: prompt
					}
				})
			]
		}),

		// What was said during the turn and not read yet would start a turn of its own once
		// this one has stopped. Stopped means stopped: it is withdrawn (which does nothing to
		// a message that was read).
		interrupt: () => ({
			write: [
				control({ subtype: 'interrupt' }),
				...said
					.splice(0)
					.map((message_uuid) => control({ subtype: 'cancel_async_message', message_uuid }))
			]
		}),

		answer(id, answers) {
			const input = asked.get(id);
			if (!input) return {};
			asked.delete(id);
			// by the question's own words, which is how Claude tells them apart
			const given = Object.fromEntries(
				(input.questions ?? []).map(({ question }, index) => [question, answers[index] ?? ''])
			);
			const response = { behavior: 'allow', updatedInput: { ...input, answers: given } };
			return {
				write: [
					line({
						type: 'control_response',
						response: { subtype: 'success', request_id: id, response }
					})
				]
			};
		},

		read(raw): Step {
			const read = raw as Line;
			if (read.type === 'system' && read.subtype === 'init') {
				// every turn begins with one, also those Claude begins by itself
				said = [];
				const events: AgentEvent[] = [{ kind: 'turn.started' }];
				if (read.session_id && read.session_id !== sessionId)
					events.unshift({ kind: 'resume', id: (sessionId = read.session_id) });
				return { events };
			}
			if (read.type === 'system' && read.subtype === 'background_tasks_changed') {
				background = read.tasks?.length ?? 0;
				return {};
			}
			if ((read.type === 'assistant' || read.type === 'user') && read.message) {
				const { content } = read.message;
				if (typeof content === 'string') return {};
				return { events: blocks(content, read.type === 'assistant') };
			}
			if (read.type === 'result') {
				asked.clear(); // a turn that is over waits for no answer
				const error = read.result || read.errors?.join('\n') || read.subtype || 'Turn failed';
				return {
					events: [read.is_error ? { kind: 'turn.failed', error } : { kind: 'turn.completed' }]
				};
			}
			if (read.type === 'control_request' && read.request_id && read.request) {
				const { subtype, tool_name, input = {} } = read.request;
				if (subtype !== 'can_use_tool') return {};
				if (tool_name === ASK && input.questions?.length) {
					asked.set(read.request_id, input);
					const questions = input.questions.map(({ question, header, options, multiSelect }) => ({
						question,
						...(header && { header }),
						options: (options ?? []).map(({ label, description }) => ({
							label,
							...(description && { description })
						})),
						multiSelect: !!multiSelect
					}));
					return { events: [{ kind: 'question', id: read.request_id, questions }] };
				}
				// Whatever else the permission mode would ask a person: nobody is there to be asked.
				const response = {
					behavior: 'deny',
					message:
						'Nobody is there to allow this: in Geordi, agents work without being asked for permission.'
				};
				return {
					write: [
						line({
							type: 'control_response',
							response: { subtype: 'success', request_id: read.request_id, response }
						})
					]
				};
			}
			return {}; // thinking, hooks, rate limits, …
		},

		busy: () => background > 0
	};
}

/** `claude -p`, told what to do over its standard input and saying what it does on its output. */
export const claude: AgentAdapter = {
	offers: () => ({
		models: MODELS.map((name) => ({ id: name.toLowerCase(), name, efforts: EFFORTS })),
		efforts: EFFORTS
	}),

	command({ sessionId, resumeId, api, settings, instructions }) {
		const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json'];
		args.push('--verbose', '--permission-mode', permissionMode);
		// what would ask a person (a question for them, above all) asks us, on its output
		args.push('--permission-prompt-tool', 'stdio');
		if (settings.model) args.push('--model', settings.model);
		if (settings.effort) args.push('--effort', settings.effort);
		if (instructions) args.push('--append-system-prompt', instructions);
		if (api) {
			// Claude expands ${VAR} in MCP configs itself.
			const headers = { Authorization: `Bearer \${${API_TOKEN_ENV}}` };
			const servers = { [API_SERVER]: { type: 'http', url: api.url, headers } };
			args.push('--mcp-config', JSON.stringify({ mcpServers: servers }));
			// Nobody is asked for permission; these tools are ours.
			args.push('--allowedTools', `mcp__${API_SERVER}`);
		}
		// Claude accepts our own UUID as its session ID, so the first turn doesn't need to wait for one.
		args.push(...(resumeId ? ['--resume', resumeId] : ['--session-id', sessionId]));
		return { cmd: 'claude', args };
	},

	dialogue
};
