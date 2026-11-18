import {
	BackgroundWork,
	SessionUpdate,
	ToolCallContent
} from '@agentclientprotocol/sdk/experimental/v2/unstable';
import type { BackgroundTask } from '@geordi/protocol';

/** Each ACP session owns its snapshot and its terminal IDs. Codex reports its
 * background shells through the asyncTasks extension of its pinned wrapper. */
export class BackgroundTasks {
	private sessions = new Map<
		string | undefined,
		{
			tasks: BackgroundTask[];
			hasWork: boolean;
			async: Map<string, BackgroundTask>;
			terminals: Map<string, { label?: string; toolCallId?: string }>;
		}
	>();
	private published = '[]';
	private emit: (tasks: BackgroundTask[]) => void;

	constructor(emit: (tasks: BackgroundTask[]) => void) {
		this.emit = emit;
	}

	busy() {
		return [...this.sessions.values()].some((session) => session.hasWork || session.async.size > 0);
	}

	receive(session: string | undefined, u: SessionUpdate) {
		// Some agents mirror a child's state before sending anything on its own session.
		if (SessionUpdate.isSubagentUpdate(u)) {
			if (u.state) this.receive(u.sessionId, { ...u.state, sessionUpdate: 'state_update' });
			return;
		}
		let state = this.sessions.get(session);
		if (!state) {
			state = { tasks: [], hasWork: false, async: new Map(), terminals: new Map() };
			this.sessions.set(session, state);
		}
		if (SessionUpdate.isStateUpdate(u)) {
			state.tasks = [];
			// Omission withdraws reporting. Only an explicit level can say the host is free to exit.
			if (Array.isArray(u.background)) {
				state.hasWork = u.background.length > 0;
				for (const ref of u.background) {
					if (BackgroundWork.isTerminal(ref))
						state.tasks.push({ type: 'terminal', id: ref.terminalId });
					else if (BackgroundWork.isToolCall(ref))
						state.tasks.push({ type: 'tool_call', id: ref.toolCallId, toolCallId: ref.toolCallId });
					else if (BackgroundWork.isSubagent(ref))
						state.tasks.push({ type: 'subagent', id: ref.sessionId });
				}
			}
		} else if (SessionUpdate.isTerminalUpdate(u)) {
			const before = state.terminals.get(u.terminalId);
			if (u.exitStatus) state.terminals.delete(u.terminalId);
			else if (u.command !== undefined)
				state.terminals.set(u.terminalId, { ...before, label: u.command ?? undefined });
			else return;
		} else if (SessionUpdate.isToolCallUpdate(u)) {
			const ref = u.content?.find(ToolCallContent.isTerminal);
			if (!ref) return;
			state.terminals.set(ref.terminalId, {
				...state.terminals.get(ref.terminalId),
				toolCallId: u.toolCallId
			});
		} else if (
			u.sessionUpdate === '_async_task_spawned' &&
			'asyncTaskId' in u &&
			typeof u.asyncTaskId === 'string'
		) {
			state.async.set(u.asyncTaskId, {
				type: 'tool_call',
				id: u.asyncTaskId,
				toolCallId: typeof u.toolCallId === 'string' ? u.toolCallId : undefined,
				label: typeof u.name === 'string' ? u.name : undefined
			});
		} else if (
			u.sessionUpdate === '_async_task_state_update' &&
			'asyncTaskId' in u &&
			typeof u.asyncTaskId === 'string' &&
			['completed', 'failed', 'stopped'].includes(String(u.state))
		) {
			state.async.delete(u.asyncTaskId);
		} else return;
		const tasks: BackgroundTask[] = [];
		for (const [owner, entries] of this.sessions) {
			for (const task of entries.tasks.concat([...entries.async.values()])) {
				const detail = task.type === 'terminal' ? entries.terminals.get(task.id) : undefined;
				tasks.push({ ...task, ...detail, ...(owner && { session: owner }) });
			}
		}
		const snapshot = JSON.stringify(tasks);
		if (snapshot !== this.published) {
			this.published = snapshot;
			this.emit(tasks);
		}
	}
}
