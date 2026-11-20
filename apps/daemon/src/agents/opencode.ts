import { setImmediate } from 'node:timers/promises';
import { Readable, Writable } from 'node:stream';
import {
	client,
	methods,
	ndJsonStream,
	PROTOCOL_VERSION,
	type NewSessionRequest,
	type NewSessionResponse,
	type ResumeSessionResponse,
	type ContentBlock
} from '@agentclientprotocol/sdk/unstable';
import type { MessageImage } from '@geordi/protocol';
import type { HostEvent } from '../host.ts';
import { API_SERVER, truncate, type SessionOptions } from './adapter.ts';
import { sessionQuestions } from './questions.ts';
import { ToolInfos } from './tool-info.ts';

/** OpenCode speaks ACP v1. The prompt response ends the turn in this version. */
export function connectOpenCode(
	options: SessionOptions,
	token: string | undefined,
	stdin: Writable,
	stdout: Readable,
	emit: (event: HostEvent) => void
) {
	let id = '';
	let running = false;
	let text = '';
	const tools = new ToolInfos();
	const questions = sessionQuestions('opencode', () => id, emit);
	function flush() {
		if (text) emit({ kind: 'text', text });
		text = '';
	}
	const connection = client({ name: 'Geordi' })
		.onRequest(methods.client.elicitation.create, questions.request)
		.onRequest(methods.client.session.requestPermission, ({ params, signal }) => {
			const kind =
				(options.settings.permissionMode ?? 'full-access') === 'full-access'
					? 'allow_once'
					: 'reject_once';
			const choice = params.options.find((o) => o.kind === kind);
			if (choice && params.sessionId === id && !signal.aborted)
				return { outcome: { outcome: 'selected', optionId: choice.optionId } };
			return { outcome: { outcome: 'cancelled' } };
		})
		.onNotification(methods.client.session.update, ({ params }) => {
			const u = params.update;
			// Commands can arrive during session/new. Ignore transcript replay during load.
			if ((!id || id === params.sessionId) && u.sessionUpdate === 'available_commands_update') {
				emit({
					kind: 'commands',
					commands: u.availableCommands.map((c) => ({
						name: c.name,
						description: c.description,
						...(c.input && { hint: c.input.hint })
					}))
				});
			}
			if (params.sessionId !== id) return;
			switch (u.sessionUpdate) {
				case 'agent_message_chunk':
					if (u.content.type === 'text') text += u.content.text;
					break;
				case 'session_info_update':
					if (u.title?.trim()) emit({ kind: 'title', title: u.title });
					break;
				case 'plan':
					flush();
					emit({
						kind: 'plan',
						id: 'plan',
						plan: {
							type: 'items',
							entries: u.entries.map(({ content, status }) => ({ content, status }))
						}
					});
					break;
				case 'usage_update':
					emit({
						kind: 'usage',
						usage: { used: u.used, size: u.size, ...(u.cost && { cost: u.cost }) }
					});
					break;
				case 'tool_call':
				case 'tool_call_update': {
					const last = u.status === 'completed' || u.status === 'failed';
					const fresh = !tools.has(u.toolCallId);
					const info = tools.news(u, last);
					if (fresh) {
						flush();
						emit({ kind: 'tool', id: u.toolCallId, name: u.title || 'Tool', input: '', ...info });
					} else if (Object.keys(info).length)
						emit({ kind: 'tool.update', id: u.toolCallId, ...info });
					if (last) {
						const output = u.content
							?.flatMap((c) =>
								c.type === 'content' && c.content.type === 'text' ? [c.content.text] : []
							)
							.join('\n');
						emit({
							kind: 'tool.result',
							id: u.toolCallId,
							output: truncate(output || JSON.stringify(u.rawOutput) || ''),
							isError: u.status === 'failed'
						});
						tools.delete(u.toolCallId);
					}
					break;
				}
			}
		})
		.connect(
			ndJsonStream(
				Writable.toWeb(stdin) as WritableStream<Uint8Array>,
				Readable.toWeb(stdout) as ReadableStream<Uint8Array>
			)
		);
	const agent = connection.agent;
	return {
		async initialize() {
			const info = await agent.request(methods.agent.initialize, {
				protocolVersion: PROTOCOL_VERSION,
				clientInfo: { name: 'Geordi', version: '1' },
				clientCapabilities: { elicitation: { form: {} } }
			});
			if (info.protocolVersion !== PROTOCOL_VERSION) throw new Error('OpenCode requires ACP v1');
			const setup: NewSessionRequest = {
				cwd: options.cwd,
				mcpServers:
					options.api && token
						? [
								{
									type: 'http',
									name: API_SERVER,
									url: options.api.url,
									headers: [{ name: 'Authorization', value: 'Bearer ' + token }]
								}
							]
						: []
			};
			let session: ResumeSessionResponse;
			if (options.resumeId) {
				const method = info.agentCapabilities?.sessionCapabilities?.resume
					? methods.agent.session.resume
					: methods.agent.session.load;
				session = await agent.request<ResumeSessionResponse>(method, {
					...setup,
					sessionId: options.resumeId
				});
				id = options.resumeId;
			} else {
				const created = await agent.request<NewSessionResponse>(methods.agent.session.new, setup);
				id = created.sessionId;
				session = created;
			}
			if (!id) throw new Error('Missing OpenCode session ID');
			if (options.settings.model) {
				const model = session.configOptions?.find((o) => o.category === 'model');
				if (!model) throw new Error('OpenCode does not offer model selection');
				await agent.request(methods.agent.session.setConfigOption, {
					sessionId: id,
					configId: model.id,
					value: options.settings.model
				});
			}
			emit({ kind: 'resume', id });
		},
		async message(message: string, images: MessageImage[]) {
			const prompt: ContentBlock[] = images.map((i) => ({
				type: 'image',
				mimeType: i.mediaType,
				data: i.data
			}));
			if (message) prompt.unshift({ type: 'text', text: message });
			running = true;
			try {
				const result = await agent
					.request(methods.agent.session.prompt, { sessionId: id, prompt })
					.finally(async () => {
						// The SDK resolves responses inline but dispatches preceding notifications
						// through async handlers. Drain those handlers before closing this turn.
						await setImmediate();
						flush();
					});
				if (result.stopReason !== 'end_turn')
					throw new Error(result.stopReason === 'cancelled' ? 'Stopped' : result.stopReason);
				emit({ kind: 'turn.completed' });
			} finally {
				running = false;
				questions.cancel();
			}
		},
		interrupt: () => agent.notify(methods.agent.session.cancel, { sessionId: id }),
		answer: questions.answer,
		stopTask: () => {},
		busy: () => running,
		close: () => connection.close()
	};
}
