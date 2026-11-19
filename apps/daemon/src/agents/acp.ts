import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import {
	client,
	methods,
	ndJsonStream,
	PROTOCOL_VERSION,
	AvailableCommand,
	ContentBlock,
	CreateElicitationRequest,
	ElicitationPropertySchema,
	IdleStateUpdate,
	MultiSelectItems,
	PlanUpdateContent,
	StateUpdate,
	type CreateElicitationResponse,
	SessionUpdate
} from '@agentclientprotocol/sdk/experimental/v2/unstable';
import type {
	Agent,
	AgentCommand,
	BackgroundTask,
	ContextUsage,
	MessageImage,
	PermissionMode,
	Question,
	TurnUsage
} from '@geordi/protocol';
import type { HostEvent } from '../host.ts';
import { BackgroundTasks } from './background-tasks.ts';
import { TerminalOutput } from './terminal-output.ts';
import { nativeSubagents } from './subagents.ts';
import { ToolInfos } from './tool-info.ts';
import { ToolDiffs } from './diffs.ts';
import { promptSuggestion } from './suggestions.ts';
import { limitsIn } from './limits.ts';
import { API_SERVER, type SessionOptions } from './adapter.ts';

/** The choice Codex adds to a question whose answer may be a note instead. */
const CODEX_OTHER = 'None of the above';

const ACP_MODES = {
	claude: { auto: 'auto', 'full-access': 'bypassPermissions' },
	codex: { auto: 'agent', 'full-access': 'agent-full-access' }
} satisfies Record<Agent, Record<PermissionMode, string>>;

/**
 * What a turn used, as the state update that ends it says (`usage`, unstable in ACP).
 * ACP's standard counts only: the wrappers' own `_meta` (per model, quota) is left out.
 */
export function turnUsage(usage: IdleStateUpdate['usage']): { usage?: TurnUsage } {
	if (!usage?.totalTokens) return {};
	const {
		totalTokens,
		inputTokens,
		outputTokens,
		thoughtTokens,
		cachedReadTokens,
		cachedWriteTokens
	} = usage;
	return {
		usage: {
			totalTokens,
			inputTokens,
			outputTokens,
			...(thoughtTokens && { thoughtTokens }),
			...(cachedReadTokens && { cachedReadTokens }),
			...(cachedWriteTokens && { cachedWriteTokens })
		}
	};
}

/**
 * The agent's commands that make no sense from Geordi: signing out of the agent, handing the
 * session to another app, renaming it (Geordi titles workspaces itself), or changing what
 * Geordi sets for every message and shows (model, effort, settings). Commands that set a
 * session option (Codex's `/plan`) are left out for that reason too, and hidden ones (`__`).
 */
const UNOFFERED: Record<Agent, string[]> = {
	claude: ['remote-control', 'rename', 'model', 'effort', 'config'],
	codex: ['logout', 'rename']
};

/** The commands of a list that work when a message begins with them, as Geordi passes on. */
export function offeredCommands(provider: Agent, list: AvailableCommand[]): AgentCommand[] {
	return list.flatMap((command) => {
		if (
			!AvailableCommand.isCommand(command) ||
			command.name.startsWith('__') ||
			UNOFFERED[provider].includes(command.name)
		)
			return [];
		const action = (command._meta?.jetbrains as { air?: { commandAction?: { kind?: unknown } } })
			?.air?.commandAction;
		if (action?.kind === 'setConfigOption') return [];
		const hint = command.input && 'hint' in command.input ? command.input.hint : undefined;
		return [
			{
				name: command.name,
				...(command.description && { description: command.description }),
				...(typeof hint === 'string' && hint && { hint })
			}
		];
	});
}

/** The host owns this connection across daemon and forge restarts. */
export function connectAgent(
	provider: Agent,
	options: SessionOptions,
	token: string | undefined,
	stdin: Writable,
	stdout: Readable,
	emit: (event: HostEvent) => void
) {
	let id = '';
	let running = false;
	let tasks: BackgroundTask[] = [];
	const publishTasks = () => emit({ kind: 'background', tasks });
	const background = new BackgroundTasks((snapshot) => {
		tasks = snapshot.map((task) => {
			const previous = tasks.find(
				(t) => t.session === task.session && t.type === task.type && t.id === task.id
			);
			if (previous)
				return {
					...task,
					stopId: previous.stopId,
					stopping: previous.stopping,
					stopError: previous.stopError
				};
			return { ...task, stopId: randomUUID() };
		});
		publishTasks();
	});
	let steering = false;
	const messages = new Map<string, string>();
	// ACP tool IDs belong to the session. A command can span several foreground turns.
	const tools = new Map<string, 'open' | 'closed'>();
	const toolInfos = new ToolInfos();
	// Codex uses the tool call ID for its ACP terminal. Keep only a transcript-sized prefix.
	const terminalOutput = new TerminalOutput();
	const diffs = new ToolDiffs();
	const questions = new Map<string, (answers?: string[]) => void>();
	let cost: ContextUsage['cost'];
	/** The commands last passed on, to pass them on again only when they change. */
	let commands: string | undefined;
	function offer(list: AvailableCommand[] | null | undefined) {
		if (!list) return;
		const offered = offeredCommands(provider, list);
		const said = JSON.stringify(offered);
		if (said === commands) return;
		commands = said;
		emit({ kind: 'commands', commands: offered });
	}

	function flush() {
		for (const text of messages.values()) if (text) emit({ kind: 'text', text });
		messages.clear();
	}
	function update(u: SessionUpdate) {
		if (terminalOutput.receive(u)) return;
		// Before the switch: the same update may carry other news (a title) for a case below.
		const suggestion = promptSuggestion(u);
		if (suggestion !== undefined) emit({ kind: 'suggestion', text: suggestion });
		switch (true) {
			case SessionUpdate.isStateUpdate(u):
				if (u.state === 'running' || u.state === 'requires_action') {
					if (!running) emit({ kind: 'turn.started' });
					running = true;
				} else if (StateUpdate.isIdle(u) && running) {
					flush();
					running = false;
					terminalOutput.retainOpen(tools);
					for (const cancel of questions.values()) cancel();
					const usage = turnUsage(u.usage);
					if (u.stopReason && u.stopReason !== 'end_turn')
						emit({
							kind: 'turn.failed',
							error:
								u.stopReason === 'cancelled'
									? 'Stopped'
									: ((IdleStateUpdate.isError(u) ? u.error?.message : undefined) ??
										String(u.stopReason)),
							...usage
						});
					else emit({ kind: 'turn.completed', ...usage });
				}
				break;
			case SessionUpdate.isAgentMessageChunk(u):
				if (ContentBlock.isText(u.content))
					messages.set(u.messageId, (messages.get(u.messageId) ?? '') + u.content.text);
				break;
			case SessionUpdate.isAgentMessage(u):
				if (u.content)
					messages.set(
						u.messageId,
						u.content.flatMap((c) => (ContentBlock.isText(c) ? [c.text] : [])).join('')
					);
				break;
			case SessionUpdate.isPlanUpdate(u): {
				const plan = u.plan;
				flush();
				if (PlanUpdateContent.isItems(plan)) {
					const entries = plan.entries.map(({ content, status }) => ({ content, status }));
					emit({
						kind: 'plan',
						id: plan.planId,
						plan: entries.length ? { type: 'items', entries } : null
					});
				} else if (
					plan.type === 'markdown' &&
					'content' in plan &&
					typeof plan.content === 'string'
				) {
					emit({
						kind: 'plan',
						id: plan.planId,
						plan: { type: 'markdown', content: plan.content }
					});
				}
				break;
			}
			// How full the context is, after every model step. Claude says what the session has
			// cost so far, but not every time: what it said last stands until it says more.
			case SessionUpdate.isUsageUpdate(u): {
				if (u.cost) cost = { amount: u.cost.amount, currency: u.cost.currency };
				emit({ kind: 'usage', usage: { used: u.used, size: u.size, ...(cost && { cost }) } });
				// and, now and then, how much of the subscription's usage limits is used
				const limits = limitsIn(u._meta);
				if (limits) emit({ kind: 'limits', limits });
				break;
			}
			case SessionUpdate.isAvailableCommandsUpdate(u):
				offer(u.availableCommands);
				break;
			// The pinned wrappers use this extension to withdraw one checklist.
			case u.sessionUpdate === 'plan_removed' && 'planId' in u && typeof u.planId === 'string':
				emit({ kind: 'plan', id: u.planId, plan: null });
				break;
			case SessionUpdate.isToolCallUpdate(u): {
				if (tools.get(u.toolCallId) === 'closed') break;
				diffs.receive(u);
				const output = terminalOutput.toolResult(provider, u);
				const { input = '', ...info } = toolInfos.news(u, output !== undefined);
				if (!tools.has(u.toolCallId)) {
					// Only a new tool adds a transcript row. Earlier tools can finish mid-reply.
					flush();
					tools.set(u.toolCallId, 'open');
					emit({
						kind: 'tool',
						id: u.toolCallId,
						name: u.name ?? u.title ?? 'Tool',
						input,
						...info
					});
				} else if (input || Object.keys(info).length) {
					emit({ kind: 'tool.update', id: u.toolCallId, ...(input && { input }), ...info });
				}
				if (output !== undefined) {
					tools.set(u.toolCallId, 'closed');
					toolInfos.delete(u.toolCallId);
					const diff = diffs.take(u);
					if (u.status !== 'cancelled')
						emit({
							kind: 'tool.result',
							id: u.toolCallId,
							output,
							isError: u.status === 'failed',
							...(diff && { diff })
						});
				}
				break;
			}
			// What the agent calls its session; the forge decides whether it names the workspace.
			case SessionUpdate.isSessionInfoUpdate(u) && !!u.title?.trim():
				emit({ kind: 'title', title: u.title! });
				break;
		}
	}
	const children = nativeSubagents(provider, emit);
	const connection = client({ name: 'Geordi' })
		.onNotification(methods.client.session.update, ({ params }) => {
			if (!id) return;
			const root = params.sessionId === id;
			background.receive(root ? undefined : params.sessionId, params.update);
			if (SessionUpdate.isSubagentUpdate(params.update) && root) flush();
			if (!children.receive(id, params.sessionId, params.update) && root) update(params.update);
		})
		.onRequest(methods.client.session.requestPermission, ({ params, signal }) => {
			const deny = params.options.find((option) => option.kind === 'reject_once');
			if (params.sessionId === id && !signal.aborted && deny)
				return { outcome: { outcome: 'selected', optionId: deny.optionId } };
			return { outcome: { outcome: 'cancelled' } };
		})
		.onRequest(
			methods.client.elicitation.create,
			({ params, signal }): Promise<CreateElicitationResponse> | CreateElicitationResponse => {
				if (
					!CreateElicitationRequest.isForm(params) ||
					!('sessionId' in params) ||
					params.sessionId !== id
				)
					return { action: 'decline' };
				const { properties, required } = params.requestedSchema;
				// Where an answer in the person's own words goes, if not into the field itself:
				// Claude has a `_custom` field beside a question, Codex a note beside a choice
				// that offers "None of the above".
				const notes = new Map<string, string>();
				for (const [name, field] of Object.entries(properties)) {
					const codex = (field._meta as { codex?: { role?: unknown; questionId?: unknown } })
						?.codex;
					if (
						provider === 'codex' &&
						codex?.role === 'user_note' &&
						typeof codex.questionId === 'string' &&
						properties[codex.questionId]
					)
						notes.set(codex.questionId, name);
					else if (
						provider === 'claude' &&
						/^question_\d+_custom$/.test(name) &&
						field.type === 'string' &&
						properties[name.slice(0, -7)]
					)
						notes.set(name.slice(0, -7), name);
				}
				const companions = new Set(notes.values());
				const fields = Object.entries(properties).filter(([name]) => !companions.has(name));
				const items: Question[] = [];
				for (const [name, field] of fields) {
					const multiple = ElicitationPropertySchema.isArray(field);
					if (!multiple && !ElicitationPropertySchema.isString(field)) return { action: 'decline' };
					const titled = multiple
						? MultiSelectItems.isTitled(field.items)
							? field.items.anyOf
							: undefined
						: field.oneOf;
					const values = multiple
						? MultiSelectItems.isString(field.items)
							? field.items.enum
							: undefined
						: field.enum;
					// The native Codex tool puts the prompt in title and the short heading in description.
					const meta = field._meta?.codex;
					const nativeQuestion =
						provider === 'codex' && meta && typeof meta === 'object' && 'isOther' in meta;
					const header = nativeQuestion ? field.description : field.title;
					const prompt = nativeQuestion ? field.title : field.description;
					const question = prompt ?? (fields.length === 1 ? params.message : field.title) ?? name;
					items.push({
						question,
						...(header && header !== question ? { header } : {}),
						...(!required?.includes(name) ? { optional: true } : {}),
						options: (
							titled?.map((o) => ({ label: o.const, description: o.description ?? o.title })) ??
							values?.map((label) => ({ label })) ??
							[]
						).filter((o) => !(notes.has(name) && o.label === CODEX_OTHER)),
						multiSelect: multiple
					});
				}
				if (!items.length) return { action: 'decline' };
				if (signal.aborted) return { action: 'cancel' };
				const codex = params._meta?.codex;
				const asyncQuestion =
					provider === 'codex' &&
					typeof codex === 'object' &&
					codex !== null &&
					'delivery' in codex &&
					codex.delivery === 'async';
				const key = randomUUID();
				return new Promise((resolve) => {
					const abort = () => answer();
					function answer(answers?: string[]) {
						questions.delete(key);
						signal.removeEventListener('abort', abort);
						if (answers?.length !== fields.length) {
							emit({ kind: 'question.closed', id: key });
							return resolve({ action: 'cancel' });
						}
						const content: Record<string, string | string[]> = {};
						for (const [i, [name]] of fields.entries()) {
							const value = answers[i];
							if (!value) continue;
							const item = items[i];
							const picks = item.multiSelect ? value.split('\n') : [value];
							const note = notes.get(name);
							if (note && picks.some((pick) => !item.options.some((o) => o.label === pick))) {
								content[note] = value;
								if (provider === 'codex') content[name] = CODEX_OTHER;
							} else {
								content[name] = item.multiSelect ? picks : value;
							}
						}
						resolve({ action: 'accept', content });
						emit({ kind: 'answer.received', id: key });
					}
					questions.set(key, answer);
					signal.addEventListener('abort', abort, { once: true });
					emit({ kind: 'question', id: key, questions: items, blocking: !asyncQuestion });
				});
			}
		)
		.connect(
			ndJsonStream(
				Writable.toWeb(stdin) as WritableStream<Uint8Array>,
				Readable.toWeb(stdout) as ReadableStream<Uint8Array>
			)
		);
	const { agent } = connection;
	async function initialize() {
		const info = await agent.request(methods.agent.initialize, {
			protocolVersion: PROTOCOL_VERSION,
			info: { name: 'Geordi', version: '1' },
			capabilities: {
				elicitation: { form: {} },
				session: { promptSuggestions: {} },
				// Both wrappers suggest what to say next only to a client that declares AIR's
				// `_meta` (see `suggestions.ts`). For Claude it changes nothing else Geordi reads.
				_meta: {
					jetbrains: {
						air: { version: 1, capabilities: provider === 'codex' ? ['asyncTasks'] : [] }
					}
				}
			}
		});
		if (info.protocolVersion !== PROTOCOL_VERSION) throw new Error('This wrapper requires ACP v2');
		steering = (info._meta?.steering as { supported?: boolean } | undefined)?.supported === true;
		const selected = options.settings.permissionMode;
		// An old installation may have restricted this session at the daemon level.
		// Require an explicit workspace choice before replacing that policy.
		if (selected === undefined) {
			const claudeMode = process.env.GEORDI_CLAUDE_PERMISSION_MODE;
			const restricted =
				provider === 'codex'
					? process.env.GEORDI_CODEX_SANDBOX === 'workspace-write'
					: claudeMode && claudeMode !== ACP_MODES.claude['full-access'];
			if (restricted)
				throw new Error(
					'Choose Auto Mode or Full Access in this workspace to replace the daemon permission setting.'
				);
		}
		const mode = ACP_MODES[provider][selected ?? 'full-access'];
		if (typeof mode !== 'string') throw new Error('Unknown workspace permission mode: ' + selected);
		const setup = {
			cwd: options.cwd,
			...(provider === 'codex' &&
				selected === 'auto' && { additionalDirectories: options.writableRoots }),
			mcpServers:
				provider === 'claude' && options.api && token
					? [
							{
								type: 'http' as const,
								name: API_SERVER,
								url: options.api.url,
								headers: [{ name: 'Authorization', value: 'Bearer ' + token }]
							}
						]
					: [],
			...(options.instructions && {
				systemPrompt: {
					mode: 'append' as const,
					content: [{ type: 'text' as const, text: options.instructions }]
				}
			})
		};
		const session = options.resumeId
			? await agent.request(methods.agent.session.resume, { ...setup, sessionId: options.resumeId })
			: await agent.request(methods.agent.session.new, setup);
		id = options.resumeId ?? ('sessionId' in session ? String(session.sessionId) : '');
		if (!id) throw new Error('Missing ACP session ID');
		offer(session.availableCommands);
		let config = session.configOptions ?? [];
		for (const [category, value] of [
			['model', options.settings.model],
			['thought_level', options.settings.effort],
			// Claude determines Auto availability from the selected model.
			['mode', mode]
		]) {
			if (!value) continue;
			const opt = config.find((o) => o.category === category);
			if (!opt) throw new Error('Wrapper does not offer ' + category);
			if (opt.type === 'select' && opt.currentValue === value) continue;
			const result = await agent.request(methods.agent.session.setConfigOption, {
				sessionId: id,
				configId: opt.configId,
				type: 'id',
				value
			});
			config = result.configOptions;
		}
		const applied = config.find((option) => option.category === 'mode');
		if (applied?.type !== 'select' || applied.currentValue !== mode)
			throw new Error('The agent could not apply permission mode ' + mode);
		emit({ kind: 'resume', id });
	}
	return {
		initialize,
		async message(text: string, images: MessageImage[]) {
			const prompt: ContentBlock[] = images.map((i) => ({
				type: 'image',
				mimeType: i.mediaType,
				data: i.data
			}));
			if (text) prompt.unshift({ type: 'text', text });
			if (running && steering) {
				const r = await agent.request<{ outcome: string }>('_session/steering', {
					sessionId: id,
					prompt,
					_meta: { steering: { idleBehavior: 'promptRequired' } }
				});
				if (r.outcome === 'injected' || r.outcome === 'startedNewTurn') return;
				if (r.outcome !== 'promptRequired') throw new Error('Steering failed: ' + r.outcome);
			}
			await agent.request(methods.agent.session.prompt, { sessionId: id, prompt });
		},
		async stopTask(stopId: string) {
			const task = tasks.find((t) => t.stopId === stopId);
			if (!task || task.stopping) return;
			task.stopping = true;
			delete task.stopError;
			publishTasks();
			const sessionId = task.session ?? id;
			try {
				if (task.type === 'subagent') {
					await agent.notify(methods.agent.session.cancel, { sessionId: task.id });
				} else if (provider === 'codex') {
					const result = await agent.request<{ stopped: boolean }>('_session/async_task/stop', {
						sessionId,
						asyncTaskId: task.id
					});
					if (!result.stopped) throw new Error('The agent could not stop this task.');
				} else if (task.type === 'terminal') {
					await agent.request(methods.agent.terminal.cancel, { sessionId, terminalId: task.id });
				} else {
					await agent.request(methods.agent.toolCall.cancel, { sessionId, toolCallId: task.id });
				}
			} catch (error) {
				const current = tasks.find((t) => t.stopId === stopId);
				if (current) {
					current.stopError = error instanceof Error ? error.message : 'Could not stop this task.';
				}
			} finally {
				const current = tasks.find((t) => t.stopId === stopId);
				if (current) {
					delete current.stopping;
					publishTasks();
				}
			}
		},
		interrupt: () => agent.notify(methods.agent.session.cancel, { sessionId: id }),
		answer: (key: string, answers: string[]) => questions.get(key)?.(answers),
		busy: () => background.busy() || running,
		close: () => connection.close()
	};
}
