import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import {
	client,
	methods,
	ndJsonStream,
	PROTOCOL_VERSION,
	ContentBlock,
	CreateElicitationRequest,
	ElicitationPropertySchema,
	IdleStateUpdate,
	MultiSelectItems,
	PlanUpdateContent,
	StateUpdate,
	type CreateElicitationResponse,
	SessionUpdate
} from '@agentclientprotocol/sdk/experimental/v2';
import type { Agent, AgentEvent, MessageImage, PermissionMode, Question } from '@geordi/protocol';
import { TerminalOutput } from './terminal-output.ts';
import { nativeSubagents } from './subagents.ts';
import { API_SERVER, truncate, type SessionOptions } from './adapter.ts';

const ACP_MODES = {
	claude: { auto: 'auto', 'full-access': 'bypassPermissions' },
	codex: { auto: 'agent', 'full-access': 'agent-full-access' }
} satisfies Record<Agent, Record<PermissionMode, string>>;

/** The host owns this connection across daemon and forge restarts. */
export function connectAgent(
	provider: Agent,
	options: SessionOptions,
	token: string | undefined,
	stdin: Writable,
	stdout: Readable,
	emit: (event: AgentEvent) => void
) {
	let id = '';
	let running = false;
	let background = false;
	let steering = false;
	const messages = new Map<string, string>();
	// ACP tool IDs belong to the session. A command can span several foreground turns.
	const tools = new Map<string, 'open' | 'closed'>();
	// Codex uses the tool call ID for its ACP terminal. Keep only a transcript-sized prefix.
	const terminalOutput = new TerminalOutput();
	const questions = new Map<string, (answers?: string[]) => void>();

	function flush() {
		for (const text of messages.values()) if (text) emit({ kind: 'text', text });
		messages.clear();
	}
	function update(u: SessionUpdate) {
		if (terminalOutput.receive(u)) return;
		switch (true) {
			case SessionUpdate.isStateUpdate(u):
				if ('background' in u && Array.isArray(u.background)) background = u.background.length > 0;
				if (u.state === 'running' || u.state === 'requires_action') {
					if (!running) emit({ kind: 'turn.started' });
					running = true;
				} else if (StateUpdate.isIdle(u) && running) {
					flush();
					running = false;
					for (const id of terminalOutput.keys()) {
						if (tools.get(id) !== 'open') terminalOutput.delete(id);
					}
					for (const cancel of questions.values()) cancel();
					if (u.stopReason && u.stopReason !== 'end_turn')
						emit({
							kind: 'turn.failed',
							error:
								u.stopReason === 'cancelled'
									? 'Stopped'
									: ((IdleStateUpdate.isError(u) ? u.error?.message : undefined) ??
										String(u.stopReason))
						});
					else emit({ kind: 'turn.completed' });
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
			// The pinned wrappers use this extension to withdraw one checklist.
			case u.sessionUpdate === 'plan_removed' && 'planId' in u && typeof u.planId === 'string':
				emit({ kind: 'plan', id: u.planId, plan: null });
				break;
			case SessionUpdate.isToolCallUpdate(u):
				flush();
				if (tools.get(u.toolCallId) === 'closed') break;
				if (!tools.has(u.toolCallId)) {
					tools.set(u.toolCallId, 'open');
					emit({
						kind: 'tool',
						id: u.toolCallId,
						name: u.name ?? u.title ?? 'Tool',
						input: truncate(JSON.stringify(u.rawInput) ?? '')
					});
				}
				if (u.status === 'completed' || u.status === 'failed') {
					const output = terminalOutput.result(provider, u);
					emit({
						kind: 'tool.result',
						id: u.toolCallId,
						output: truncate(typeof output === 'string' ? output : (JSON.stringify(output) ?? '')),
						isError: u.status === 'failed'
					});
				}
				if (u.status === 'completed' || u.status === 'failed' || u.status === 'cancelled') {
					tools.set(u.toolCallId, 'closed');
					terminalOutput.delete(u.toolCallId);
				}
				break;
		}
	}
	const children = nativeSubagents(provider, emit);
	const connection = client({ name: 'Geordi' })
		.onNotification(methods.client.session.update, ({ params }) => {
			if (!id) return;
			const root = params.sessionId === id;
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
				const companion = (name: string) =>
					provider === 'claude' &&
					/^question_\d+$/.test(name) &&
					properties[name + '_custom']?.type === 'string';
				const fields = Object.entries(properties).filter(
					([name]) => !(name.endsWith('_custom') && companion(name.slice(0, -7)))
				);
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
						options:
							titled?.map((o) => ({ label: o.const, description: o.description ?? o.title })) ??
							values?.map((label) => ({ label })) ??
							[],
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
							if (
								companion(name) &&
								picks.some((pick) => !item.options.some((o) => o.label === pick))
							) {
								content[name + '_custom'] = value;
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
			capabilities: { elicitation: { form: {} } }
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
		interrupt: () => agent.notify(methods.agent.session.cancel, { sessionId: id }),
		answer: (key: string, answers: string[]) => questions.get(key)?.(answers),
		busy: () => background || running,
		close: () => connection.close()
	};
}
