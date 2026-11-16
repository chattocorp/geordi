import type { AgentEvent } from '@geordi/protocol';
import { API_SERVER, API_TOKEN_ENV, truncate, type AgentAdapter } from './adapter.ts';

/**
 * Agents run unattended and need to commit, push and use `gh`, so by default nothing asks
 * for permission. `auto` or `acceptEdits` restrict that again.
 */
const permissionMode = process.env.GEORDI_CLAUDE_PERMISSION_MODE || 'bypassPermissions';

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

function parseBlock(block: Block): AgentEvent[] {
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

/** `--effort` levels, the least first. */
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** The CLI's aliases, each for the latest model of its kind. */
const MODELS = ['Fable', 'Opus', 'Sonnet', 'Haiku'];

/** `claude -p` with `--output-format stream-json`. */
export const claude: AgentAdapter = {
	offers: () => ({
		models: MODELS.map((name) => ({ id: name.toLowerCase(), name, efforts: EFFORTS })),
		efforts: EFFORTS
	}),

	command({ sessionId, prompt, resumeId, api, settings, instructions }) {
		const args = ['-p', '--output-format', 'stream-json', '--verbose'];
		args.push('--permission-mode', permissionMode);
		if (settings.model) args.push('--model', settings.model);
		if (settings.effort) args.push('--effort', settings.effort);
		if (instructions) args.push('--append-system-prompt', instructions);
		if (api) {
			// Claude expands ${VAR} in MCP configs itself.
			const headers = { Authorization: `Bearer \${${API_TOKEN_ENV}}` };
			const servers = { [API_SERVER]: { type: 'http', url: api.url, headers } };
			args.push('--mcp-config', JSON.stringify({ mcpServers: servers }));
			// Non-interactive runs can't ask for permission; these tools are ours.
			args.push('--allowedTools', `mcp__${API_SERVER}`);
		}
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
			if (typeof content === 'string') return [];
			// What Claude says is the assistant's. A `user` line carries tool results, and
			// text the CLI hands the model on our behalf (a skill's instructions, say): that
			// is context for the agent, not something it said.
			const blocks =
				line.type === 'user' ? content.filter((block) => block.type !== 'text') : content;
			return blocks.flatMap(parseBlock);
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
