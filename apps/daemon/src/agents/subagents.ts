import {
	ContentBlock,
	SessionUpdate,
	StateUpdate
} from '@agentclientprotocol/sdk/experimental/v2/unstable';
import type { Agent, AgentEvent, SubagentState, SubagentUpdate } from '@geordi/protocol';
import { TerminalOutput } from './terminal-output.ts';
import { ToolInfos } from './tool-info.ts';
import { ToolDiffs } from './diffs.ts';

function stateOf(state: StateUpdate | null): SubagentState {
	if (state?.state === 'running') return 'running';
	if (state?.state === 'requires_action') return 'waiting';
	if (state && StateUpdate.isIdle(state)) {
		if (state.stopReason === 'end_turn') return 'done';
		return state.stopReason === 'cancelled' ? 'stopped' : 'failed';
	}
	return 'unknown';
}

/** Child session IDs and message IDs have different scopes. Keep streamed messages
 * per child and write snapshots at content boundaries, as for the root session. */
export function nativeSubagents(provider: Agent, emit: (event: AgentEvent) => void) {
	type Message = { text: string; incoming: boolean };
	type Child = {
		path: string[];
		messages: Map<string, Message>;
		dirty: Set<string>;
		terminal: TerminalOutput;
		tools: ToolInfos;
		diffs: ToolDiffs;
		state?: SubagentState;
	};
	const children = new Map<string, Child>();
	function send(child: Child, update: SubagentUpdate) {
		emit({ kind: 'subagent', path: child.path, update });
	}
	function flush(child: Child) {
		for (const id of child.dirty) send(child, { kind: 'message', id, ...child.messages.get(id)! });
		child.dirty.clear();
	}
	function receive(root: string, session: string, u: SessionUpdate) {
		const child = children.get(session);
		if (session !== root && !child) return false;
		if (SessionUpdate.isSubagentUpdate(u)) {
			if (u.sessionId === root || child?.path.includes(u.sessionId)) return true;
			if (child) flush(child);
			let target = children.get(u.sessionId);
			const fresh = !target;
			if (!target) {
				target = {
					path: [...(child?.path ?? []), u.sessionId],
					messages: new Map(),
					dirty: new Set(),
					terminal: new TerminalOutput(),
					tools: new ToolInfos(),
					diffs: new ToolDiffs()
				};
				children.set(u.sessionId, target);
			}
			flush(target);
			const state = u.state === undefined ? undefined : stateOf(u.state);
			if (
				!fresh &&
				u.title === undefined &&
				u.description === undefined &&
				(state === undefined || state === target.state)
			)
				return true;
			if (state !== undefined) target.state = state;
			send(target, {
				kind: 'info',
				...(u.title !== undefined && { title: u.title }),
				...(u.description !== undefined && { description: u.description }),
				...(state !== undefined && { state })
			});
			return true;
		}
		if (!child) return false;
		if (child.terminal.receive(u)) return true;
		const chunk =
			SessionUpdate.isUserMessageChunk(u) ||
			SessionUpdate.isAgentMessageChunk(u) ||
			SessionUpdate.isSessionMessageChunk(u);
		if (
			chunk ||
			SessionUpdate.isUserMessage(u) ||
			SessionUpdate.isAgentMessage(u) ||
			SessionUpdate.isSessionMessage(u)
		) {
			const entry = child.messages.get(u.messageId) ?? { text: '', incoming: false };
			if (SessionUpdate.isUserMessage(u) || SessionUpdate.isUserMessageChunk(u))
				entry.incoming = true;
			if (SessionUpdate.isSessionMessage(u) && u.recipientSessionId !== undefined)
				entry.incoming = u.recipientSessionId === session;
			if (chunk) {
				if (ContentBlock.isText(u.content)) entry.text += u.content.text;
			} else if (u.content !== undefined) {
				entry.text = (u.content ?? [])
					.flatMap((c) => (ContentBlock.isText(c) ? [c.text] : []))
					.join('');
			}
			child.messages.set(u.messageId, entry);
			child.dirty.add(u.messageId);
			if (!chunk) flush(child);
		} else if (SessionUpdate.isToolCallUpdate(u)) {
			flush(child);
			child.diffs.receive(u);
			const output = child.terminal.toolResult(provider, u);
			const fresh = !child.tools.has(u.toolCallId);
			const news = child.tools.news(u, output !== undefined);
			if (output !== undefined) child.tools.delete(u.toolCallId);
			const diff = output !== undefined ? child.diffs.take(u) : undefined;
			const name = fresh && (u.name ?? u.title);
			if (!fresh && !Object.keys(news).length && output === undefined) return true;
			send(child, {
				kind: 'tool',
				id: u.toolCallId,
				...(name && { name }),
				...news,
				...(output !== undefined && {
					output,
					isError: u.status !== 'completed'
				}),
				...(diff && { diff })
			});
		} else if (SessionUpdate.isStateUpdate(u)) {
			flush(child);
			const state = stateOf(u);
			if (state !== child.state) send(child, { kind: 'info', state });
			child.state = state;
		}
		return true;
	}
	return { receive };
}
