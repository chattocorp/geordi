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
import type { Agent, AgentEvent, MessageImage, Question } from '@geordi/protocol';
import { API_SERVER, truncate, type SessionOptions } from './adapter.ts';

// Limit buffered terminal output before decoding arbitrarily large ACP chunks.
const MAX_TERMINAL_BYTES = 16 * 1024;
function terminalBytes(data: string, limit: number) {
	return Buffer.from(data.slice(0, 4 * Math.ceil(limit / 3)), 'base64').subarray(0, limit);
}

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
	const tools = new Set<string>();
	// Codex uses the tool call ID for its ACP terminal. Keep only a transcript-sized prefix.
	const terminalOutput = new Map<string, Buffer>();
	const questions = new Map<string, (answers?: string[]) => void>();

	function flush() {
		for (const text of messages.values()) if (text) emit({ kind: 'text', text });
		messages.clear();
	}
	function update(u: SessionUpdate) {
		switch (true) {
			case SessionUpdate.isStateUpdate(u):
				if ('background' in u && Array.isArray(u.background)) background = u.background.length > 0;
				if (u.state === 'running' || u.state === 'requires_action') {
					if (!running) emit({ kind: 'turn.started' });
					running = true;
				} else if (StateUpdate.isIdle(u) && running) {
					flush();
					running = false;
					tools.clear();
					terminalOutput.clear();
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
			case SessionUpdate.isTerminalOutputChunk(u): {
				const before = terminalOutput.get(u.terminalId) ?? Buffer.alloc(0);
				if (before.length < MAX_TERMINAL_BYTES) {
					const bytes = terminalBytes(u.data, MAX_TERMINAL_BYTES - before.length);
					terminalOutput.set(u.terminalId, Buffer.concat([before, bytes]));
				}
				break;
			}
			case SessionUpdate.isTerminalUpdate(u):
				if (u.output)
					terminalOutput.set(u.terminalId, terminalBytes(u.output.data, MAX_TERMINAL_BYTES));
				break;
			case SessionUpdate.isToolCallUpdate(u):
				flush();
				if (!tools.has(u.toolCallId)) {
					tools.add(u.toolCallId);
					emit({
						kind: 'tool',
						id: u.toolCallId,
						name: u.name ?? u.title ?? 'Tool',
						input: truncate(JSON.stringify(u.rawInput) ?? '')
					});
				}
				if (u.status === 'completed' || u.status === 'failed') {
					const output =
						terminalOutput.get(u.toolCallId)?.toString('utf8') ?? u.rawOutput ?? u.content;
					emit({
						kind: 'tool.result',
						id: u.toolCallId,
						output: truncate(typeof output === 'string' ? output : (JSON.stringify(output) ?? '')),
						isError: u.status === 'failed'
					});
					terminalOutput.delete(u.toolCallId);
				}
				break;
		}
	}
	const connection = client({ name: 'Geordi' })
		.onNotification(methods.client.session.update, ({ params }) => {
			if (id && params.sessionId === id) update(params.update);
		})
		.onRequest(methods.client.session.requestPermission, () => ({
			outcome: { outcome: 'cancelled' }
		}))
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
		const sandboxed =
			provider === 'codex' && process.env.GEORDI_CODEX_SANDBOX === 'workspace-write';
		const setup = {
			cwd: options.cwd,
			...(sandboxed && { additionalDirectories: options.writableRoots }),
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
		const mode =
			provider === 'codex'
				? sandboxed
					? 'workspace-write'
					: 'agent-full-access'
				: process.env.GEORDI_CLAUDE_PERMISSION_MODE || 'bypassPermissions';
		for (const [category, value] of [
			['mode', mode],
			['model', options.settings.model],
			['thought_level', options.settings.effort]
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
