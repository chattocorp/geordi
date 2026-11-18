import {
	ContentBlock,
	ToolCallContent,
	SessionUpdate,
	type ToolCallUpdate
} from '@agentclientprotocol/sdk/experimental/v2';
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
export class TerminalOutput extends Map<string, Buffer> {
	receive(u: SessionUpdate) {
		if (SessionUpdate.isTerminalOutputChunk(u)) {
			const before = this.get(u.terminalId) ?? Buffer.alloc(0);
			if (before.length < MAX_TERMINAL_BYTES) {
				const bytes = terminalBytes(u.data, MAX_TERMINAL_BYTES - before.length);
				this.set(u.terminalId, Buffer.concat([before, bytes]));
			}
		} else if (SessionUpdate.isTerminalUpdate(u)) {
			if (u.output) this.set(u.terminalId, terminalBytes(u.output.data, MAX_TERMINAL_BYTES));
		} else return false;
		return true;
	}
	result(provider: Agent, u: ToolCallUpdate) {
		const terminal = u.content?.find(ToolCallContent.isTerminal);
		return (
			(provider === 'codex' ? codexCommandText(u) : undefined) ??
			this.get(terminal?.terminalId ?? u.toolCallId)?.toString('utf8') ??
			u.rawOutput ??
			u.content
		);
	}
}
