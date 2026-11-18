import {
	ContentBlock,
	ToolCallContent,
	SessionUpdate,
	type ToolCallUpdate
} from '@agentclientprotocol/sdk/experimental/v2';
import { truncate } from './adapter.ts';
import type { Agent } from '@geordi/protocol';

// Limit buffered terminal output before decoding arbitrarily large ACP chunks.
const MAX_TERMINAL_BYTES = 16 * 1024;
function terminalBytes(data: string, limit: number) {
	return Buffer.from(data.slice(0, 4 * Math.ceil(limit / 3)), 'base64').subarray(0, limit);
}

// Codex can finish a background command with its full output in a text block
// and only its exit code in rawOutput, even if earlier bytes streamed to a terminal.
function codexCommandText(update: ToolCallUpdate) {
	const raw = update.rawOutput;
	if (!raw || typeof raw !== 'object' || !('exit_code' in raw) || Object.keys(raw).length !== 1)
		return;
	if (update.content?.length !== 1) return;
	const [block] = update.content;
	if (ToolCallContent.isContent(block) && ContentBlock.isText(block.content))
		return block.content.text;
}

// ACP terminal IDs are scoped to one session.
export class TerminalOutput {
	private buffers = new Map<string, Buffer>();
	private terminalByTool = new Map<string, string>();

	receive(u: SessionUpdate) {
		if (SessionUpdate.isTerminalOutputChunk(u)) {
			const before = this.buffers.get(u.terminalId) ?? Buffer.alloc(0);
			if (before.length < MAX_TERMINAL_BYTES) {
				const bytes = terminalBytes(u.data, MAX_TERMINAL_BYTES - before.length);
				this.buffers.set(u.terminalId, Buffer.concat([before, bytes]));
			}
		} else if (SessionUpdate.isTerminalUpdate(u)) {
			if (u.output)
				this.buffers.set(u.terminalId, terminalBytes(u.output.data, MAX_TERMINAL_BYTES));
		} else return false;
		return true;
	}
	/** A status-only completion can arrive in a later turn. Keep the terminal
	 * reference from the earlier tool update until we consume its output. */
	toolResult(provider: Agent, u: ToolCallUpdate): string | undefined {
		const ref = u.content?.find(ToolCallContent.isTerminal);
		if (ref) this.terminalByTool.set(u.toolCallId, ref.terminalId);
		if (u.status !== 'completed' && u.status !== 'failed' && u.status !== 'cancelled') return;
		const id = this.terminalByTool.get(u.toolCallId) ?? u.toolCallId;
		const output =
			(provider === 'codex' ? codexCommandText(u) : undefined) ??
			this.buffers.get(id)?.toString('utf8') ??
			u.rawOutput ??
			u.content;
		this.buffers.delete(id);
		this.terminalByTool.delete(u.toolCallId);
		return truncate(typeof output === 'string' ? output : (JSON.stringify(output) ?? ''));
	}

	retainOpen(tools: ReadonlyMap<string, 'open' | 'closed'>) {
		const linked = new Set(this.terminalByTool.values());
		for (const id of this.buffers.keys())
			if (!linked.has(id) && tools.get(id) !== 'open') this.buffers.delete(id);
	}
}
