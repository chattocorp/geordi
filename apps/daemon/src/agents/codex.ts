import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SETTING, type AgentEvent, type Model } from '@geordi/protocol';
import {
	API_SERVER,
	API_TOKEN_ENV,
	truncate,
	type AgentAdapter,
	type Dialogue,
	type SessionOptions,
	type Step
} from './adapter.ts';

/** Something a thread is made of. Fields vary by `type`; we read the ones we know about. */
type Item = {
	id: string;
	type: string;
	text?: string;
	/** `commandExecution` */
	command?: string;
	aggregatedOutput?: string | null;
	exitCode?: number | null;
	/** `fileChange` */
	changes?: { path: string; kind: { type: string } }[];
	status?: string;
	/** `mcpToolCall` */
	server?: string;
	tool?: string;
	arguments?: unknown;
	result?: { content?: { type: string; text?: string }[] } | null;
	error?: { message?: string } | null;
};

/** What a turn is made of, on our side. */
type Input = { type: 'text'; text: string } | { type: 'image'; url: string };

/**
 * A line of `codex app-server`: JSON-RPC, without saying so. With `method` and `id` it asks
 * us something, with `method` alone it tells us something, and with `id` alone it answers
 * what we asked.
 */
type Message = {
	id?: number | string;
	method?: string;
	params?: {
		threadId?: string;
		turn?: { id: string; status?: string; error?: { message?: string } | null };
		item?: Item;
		/** `item/tool/requestUserInput` */
		questions?: {
			id: string;
			header?: string;
			question: string;
			options?: { label: string; description?: string }[] | null;
		}[];
		/** `item/permissions/requestApproval` */
		permissions?: unknown;
	};
	result?: { thread?: { id: string }; turn?: { id: string } };
	error?: { message?: string };
};

/** What we asked Codex and have no answer to yet: enough to know what the answer means. */
type Asked =
	| { kind: 'initialize' | 'thread' | 'turn' | 'interrupt' }
	| { kind: 'steer'; turnId: string; input: Input[] };

/**
 * Agents run unattended and need to commit, push and use `gh` (which needs the network), so
 * by default Codex runs without its sandbox. `GEORDI_CODEX_SANDBOX=workspace-write` puts it
 * back in: it can then only write to the worktree, and has no network.
 */
const sandboxed = process.env.GEORDI_CODEX_SANDBOX === 'workspace-write';

/** What is told as it grows, which we only read once it is whole. */
const UNREAD = [
	'item/agentMessage/delta',
	'item/commandExecution/outputDelta',
	'item/fileChange/outputDelta',
	'item/plan/delta',
	'item/reasoning/summaryTextDelta',
	'item/reasoning/textDelta'
];

/** How a turn that was stopped is said to have ended. */
const INTERRUPTED = 'Interrupted';

const line = (message: unknown) => JSON.stringify(message);

/** Named like Claude names MCP tools, so both agents' calls read the same. */
const mcp = (item: Item) => `mcp__${item.server}__${item.tool}`;

/** What is shown as soon as it begins: it may take a while. */
function started(item: Item): AgentEvent[] {
	if (item.type === 'commandExecution')
		return [{ kind: 'tool', id: item.id, name: 'shell', input: item.command ?? '' }];
	if (item.type === 'mcpToolCall')
		return [
			{ kind: 'tool', id: item.id, name: mcp(item), input: JSON.stringify(item.arguments ?? {}) }
		];
	return [];
}

function completed(item: Item): AgentEvent[] {
	switch (item.type) {
		case 'agentMessage':
			return [{ kind: 'text', text: item.text ?? '' }];
		case 'commandExecution':
			return [
				{
					kind: 'tool.result',
					id: item.id,
					output: truncate(item.aggregatedOutput ?? ''),
					isError: item.exitCode !== 0
				}
			];
		case 'fileChange': {
			const summary = (item.changes ?? []).map((c) => `${c.kind.type} ${c.path}`).join('\n');
			return [
				{ kind: 'tool', id: item.id, name: 'edit', input: summary },
				{ kind: 'tool.result', id: item.id, output: summary, isError: item.status !== 'completed' }
			];
		}
		case 'mcpToolCall': {
			const texts = (item.result?.content ?? []).flatMap((part) => part.text ?? []);
			const output = item.error?.message ?? texts.join('\n');
			return [
				{ kind: 'tool.result', id: item.id, output: truncate(output), isError: !!item.error }
			];
		}
		case 'userMessage': // what we said ourselves
		case 'hookPrompt':
		case 'reasoning':
			return [];
		default:
			return [
				{ kind: 'tool', id: item.id, name: item.type, input: '' },
				{ kind: 'tool.result', id: item.id, output: truncate(JSON.stringify(item)), isError: false }
			];
	}
}

/**
 * What to answer when Codex asks whether it may do something. Nothing is configured to
 * ask, but whatever asks anyway must not wait for a person who was never going to be asked.
 * Without its sandbox there is nothing to give away, and the answer is yes. In its sandbox,
 * what it asks for is a way out of it, which nobody is there to grant: the answer is no.
 */
function allowed(method: string, params: Message['params']): unknown {
	switch (method) {
		case 'item/commandExecution/requestApproval':
		case 'item/fileChange/requestApproval':
			return { decision: sandboxed ? 'decline' : 'accept' };
		case 'item/permissions/requestApproval':
			return { permissions: sandboxed ? {} : (params?.permissions ?? {}) };
		// the same two questions, as older versions of the protocol ask them
		case 'execCommandApproval':
		case 'applyPatchApproval':
			return { decision: sandboxed ? 'denied' : 'approved' };
		case 'mcpServer/elicitation/request':
			return sandboxed ? { action: 'decline' } : { action: 'accept', content: {} };
	}
}

const both = (a: Step, b: Step): Step => ({
	write: [...(a.write ?? []), ...(b.write ?? [])],
	events: [...(a.events ?? []), ...(b.events ?? [])]
});

/**
 * Talks to `codex app-server` in its JSON-RPC: a thread is started (or taken up again),
 * and each thing said to the agent starts a turn in it, or steers the one under way.
 */
function dialogue({ cwd, resumeId, settings, instructions }: SessionOptions): Dialogue {
	let threadId: string | undefined;
	/** The turn under way, once Codex has said which it is. */
	let turnId: string | undefined;
	/** Whether a turn was asked for that Codex has not named yet. */
	let starting = false;
	/** Whether that turn is to be stopped as soon as it has a name. */
	let stopping = false;
	/** Why nothing can be said to Codex any more, if so: there is no thread to say it in. */
	let broken: string | undefined;
	/** What is to be said and could not be yet. */
	const held: Input[] = [];
	let requests = 0;
	const asked = new Map<number, Asked>();
	/** The tool calls that were shown and have not ended. */
	const running = new Set<string>();
	/** What Codex has asked the person and not been answered, by request: its own ID, and its questions'. */
	const questions = new Map<string, { id: number | string; ids: string[] }>();

	function request(method: string, params: unknown, what: Asked): string {
		asked.set(++requests, what);
		return line({ id: requests, method, params });
	}

	/** Says what is held, if it can be said now: to the turn under way, or as a new one. */
	function flush(): Step {
		if (!held.length || !threadId || starting) return {};
		const input = held.splice(0);
		if (turnId) {
			const steer = { threadId, expectedTurnId: turnId, input };
			return { write: [request('turn/steer', steer, { kind: 'steer', turnId, input })] };
		}
		starting = true;
		// A thread taken up again runs as it did before, whatever Codex was started with.
		const turn = { threadId, input, ...(settings.effort && { effort: settings.effort }) };
		return {
			write: [request('turn/start', turn, { kind: 'turn' })],
			events: [{ kind: 'turn.started' }]
		};
	}

	/** The turn under way has a name: what waited for that can go ahead. */
	function began(id: string): Step {
		turnId = id;
		starting = false;
		if (!stopping) return flush();
		stopping = false;
		return interrupt();
	}

	function interrupt(): Step {
		return {
			write: [request('turn/interrupt', { threadId, turnId }, { kind: 'interrupt' })]
		};
	}

	/** A turn is over. What it left unfinished ends with it, and what was held begins the next. */
	function ended(event: AgentEvent): Step {
		// Codex says nothing more of a command it was stopped in the middle of.
		const cut = [...running].map((id): AgentEvent => ({
			kind: 'tool.result',
			id,
			output: '',
			isError: true
		}));
		running.clear();
		questions.clear();
		turnId = undefined;
		starting = stopping = false;
		return both({ events: [...cut, event] }, flush());
	}

	/** Codex's answer to something we asked. */
	function answered(what: Asked, { result, error }: Message): Step {
		if (error) {
			const message = error.message || 'Codex refused a request';
			switch (what.kind) {
				case 'initialize':
				case 'thread':
					broken = message;
					held.length = 0;
					return { events: [{ kind: 'turn.failed', error: message }] };
				case 'turn':
					return ended({ kind: 'turn.failed', error: message });
				case 'steer':
					// Mostly: the turn ended as we spoke. Then this begins the next one; if
					// the turn goes on and won't be steered, it waits for its end.
					held.unshift(...what.input);
					return turnId === what.turnId ? {} : flush();
				case 'interrupt':
					return {}; // nothing to stop any more: its end has been told
			}
		}
		if (what.kind === 'thread' && result?.thread) {
			threadId = result.thread.id;
			return both({ events: [{ kind: 'resume', id: threadId }] }, flush());
		}
		if (what.kind === 'turn' && result?.turn) return began(result.turn.id);
		return {};
	}

	/** Something Codex wants to know from us, and waits for. */
	function asks(id: number | string, method: string, params: Message['params']): Step {
		if (method === 'item/tool/requestUserInput' && params?.questions?.length) {
			questions.set(String(id), { id, ids: params.questions.map((question) => question.id) });
			return {
				events: [
					{
						kind: 'question',
						id: String(id),
						questions: params.questions.map(({ question, header, options }) => ({
							question,
							...(header && { header }),
							options: (options ?? []).map(({ label, description }) => ({
								label,
								...(description && { description })
							})),
							multiSelect: false
						}))
					}
				]
			};
		}
		const result = allowed(method, params);
		if (result) return { write: [line({ id, result })] };
		// tools and credentials of a client's own, which we never said we had
		return {
			write: [line({ id, error: { code: -32601, message: `Geordi cannot do ${method}` } })]
		};
	}

	return {
		open() {
			const thread = {
				cwd,
				// what a thread taken up again would otherwise keep as it was
				...(settings.model && { model: settings.model }),
				...(instructions && { developerInstructions: instructions }),
				approvalPolicy: 'never',
				sandbox: sandboxed ? 'workspace-write' : 'danger-full-access'
			};
			const client = {
				clientInfo: { name: 'geordi', title: 'Geordi', version: '1' },
				capabilities: { optOutNotificationMethods: UNREAD }
			};
			// all at once: Codex takes them in order
			return [
				request('initialize', client, { kind: 'initialize' }),
				line({ method: 'initialized' }),
				resumeId
					? // without what was said so far, which the forge has
						request(
							'thread/resume',
							{ ...thread, threadId: resumeId, excludeTurns: true },
							{ kind: 'thread' }
						)
					: request('thread/start', thread, { kind: 'thread' })
			];
		},

		message(prompt, images) {
			if (broken) return { events: [{ kind: 'turn.failed', error: broken }] };
			for (const { mediaType, data } of images)
				held.push({ type: 'image', url: `data:${mediaType};base64,${data}` });
			if (prompt || !images.length) held.push({ type: 'text', text: prompt });
			return flush();
		},

		interrupt() {
			if (turnId) return interrupt();
			if (starting) {
				stopping = true;
				return {};
			}
			// nothing has reached Codex yet, and now nothing will
			held.length = 0;
			return { events: [{ kind: 'turn.failed', error: INTERRUPTED }] };
		},

		answer(id, answers) {
			const question = questions.get(id);
			if (!question) return {};
			questions.delete(id);
			const given = Object.fromEntries(
				question.ids.map((id, index) => [id, { answers: [answers[index] ?? ''] }])
			);
			return { write: [line({ id: question.id, result: { answers: given } })] };
		},

		read(raw): Step {
			const read = raw as Message;
			const { id, method, params } = read;
			if (!method) {
				const what = asked.get(Number(id));
				asked.delete(Number(id));
				return what ? answered(what, read) : {};
			}
			if (id !== undefined) return asks(id, method, params);
			// Codex's agents may start agents, each in a thread of its own: not our conversation.
			if (params?.threadId !== threadId) return {};
			switch (method) {
				case 'turn/started':
					// also those Codex begins by itself
					return params?.turn
						? both({ events: [{ kind: 'turn.started' }] }, began(params.turn.id))
						: {};
				case 'item/started': {
					const events = params?.item ? started(params.item) : [];
					for (const event of events) if (event.kind === 'tool') running.add(event.id);
					return { events };
				}
				case 'item/completed': {
					if (!params?.item) return {};
					// what was not shown as it began (it never said so) is shown now
					const events = running.delete(params.item.id)
						? completed(params.item)
						: [...started(params.item), ...completed(params.item)];
					return { events };
				}
				case 'turn/completed': {
					const { status, error } = params?.turn ?? {};
					if (status === 'completed') return ended({ kind: 'turn.completed' });
					const reason = error?.message || (status === 'interrupted' ? INTERRUPTED : 'Turn failed');
					return ended({ kind: 'turn.failed', error: reason });
				}
				default:
					// warnings, token counts, MCP servers starting, and `error`, whose turn
					// says the same when it ends
					return {};
			}
		},

		busy: () => false
	};
}

/**
 * Reads the models Codex offers from the list it keeps for its own model picker. That file
 * is Codex's business, not an interface: if it is missing or looks different, there are
 * simply no models to choose from, and Codex runs with the one it is configured for.
 */
export function modelsIn(cache: string): Model[] {
	try {
		const { models } = JSON.parse(cache) as {
			models: {
				slug: string;
				display_name?: string;
				visibility?: string;
				supported_reasoning_levels?: { effort: string }[];
			}[];
		};
		return models
			.filter((model) => model.visibility === 'list' && SETTING.test(model.slug))
			.map((model) => ({
				id: model.slug,
				name: model.display_name ?? model.slug,
				efforts: (model.supported_reasoning_levels ?? [])
					.map((level) => level.effort)
					.filter((effort) => SETTING.test(effort))
			}));
	} catch {
		return [];
	}
}

/** `codex app-server`, told what to do over its standard input and saying what it does on its output. */
export const codex: AgentAdapter = {
	offers() {
		let cache = '';
		try {
			const home = process.env.CODEX_HOME || join(homedir(), '.codex');
			cache = readFileSync(join(home, 'models_cache.json'), 'utf8');
		} catch {
			// no list: nothing to choose from
		}
		const models = modelsIn(cache);
		// without a model chosen, only what every model can do is safe to ask for
		const efforts = (models[0]?.efforts ?? []).filter((effort) =>
			models.every((model) => model.efforts.includes(effort))
		);
		return { models, efforts };
	},

	// Only what a thread cannot be told when it starts; the rest is said then (`open`).
	command({ writableRoots, api }) {
		// lets the agent ask the person something outside Codex's plan mode, too
		const config = ['features.default_mode_request_user_input=true'];
		if (sandboxed)
			// Commits in a worktree write to parts of the main repository's .git, outside the workspace.
			config.push(`sandbox_workspace_write.writable_roots=${JSON.stringify(writableRoots)}`);
		if (api)
			config.push(
				`mcp_servers.${API_SERVER}.url=${JSON.stringify(api.url)}`,
				`mcp_servers.${API_SERVER}.bearer_token_env_var="${API_TOKEN_ENV}"`
			);
		return { cmd: 'codex', args: ['app-server', ...config.flatMap((entry) => ['-c', entry])] };
	},

	dialogue
};
