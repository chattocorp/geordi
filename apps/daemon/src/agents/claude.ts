import type { SessionEvent } from '@geordi/protocol';
import { truncate, type AgentAdapter } from './adapter.ts';

const permissionMode = process.env.GEORDI_CLAUDE_PERMISSION_MODE || 'acceptEdits';

type Block =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
	| { type: string };

type Line =
	| { type: 'system'; subtype: string; session_id: string }
	| { type: 'assistant' | 'user'; message: { content: Block[] | string } }
	| { type: 'result'; is_error: boolean; subtype: string; result?: string }
	| { type: string };

function stringify(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content))
		return content.map((c) => (c?.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
	return JSON.stringify(content);
}

function parseBlock(block: Block): SessionEvent[] {
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

/** `claude -p` with `--output-format stream-json`. */
export const claude: AgentAdapter = {
	command({ sessionId, prompt, resumeId }) {
		const args = ['-p', '--output-format', 'stream-json', '--verbose'];
		args.push('--permission-mode', permissionMode);
		// Claude accepts our own UUID as its session ID, so the first turn doesn't need to wait for one.
		args.push(...(resumeId ? ['--resume', resumeId] : ['--session-id', sessionId]));
		// `--` keeps prompts starting with `-` from being parsed as flags.
		args.push('--', prompt);
		return { cmd: 'claude', args };
	},

	parse(raw) {
		const line = raw as Line;
		if (line.type === 'system' && 'subtype' in line && line.subtype === 'init')
			return [{ kind: 'resume', id: line.session_id }];
		if ((line.type === 'assistant' || line.type === 'user') && 'message' in line) {
			const { content } = line.message;
			return typeof content === 'string' ? [] : content.flatMap(parseBlock);
		}
		if (line.type === 'result' && 'is_error' in line)
			return [
				line.is_error
					? { kind: 'turn.failed', error: line.result || line.subtype }
					: { kind: 'turn.completed' }
			];
		return [];
	}
};
