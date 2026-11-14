import type { SessionEvent } from '@geordi/protocol';
import { API_SERVER, API_TOKEN_ENV, truncate, type AgentAdapter } from './adapter.ts';

/** A `codex exec --json` line. Fields vary by `type`; we read the ones we know about. */
type Line = {
	type: string;
	thread_id?: string;
	error?: { message: string };
	item?: {
		id: string;
		type: string;
		text?: string;
		command?: string;
		aggregated_output?: string;
		exit_code?: number | null;
		changes?: { path: string; kind: string }[];
		/** `mcp_tool_call` */
		server?: string;
		tool?: string;
		arguments?: unknown;
		result?: { content?: { type: string; text?: string }[] } | null;
		error?: { message?: string } | null;
	};
};

type Item = NonNullable<Line['item']>;

function started(item: Item): SessionEvent[] {
	if (item.type === 'command_execution')
		return [{ kind: 'tool', id: item.id, name: 'shell', input: item.command ?? '' }];
	return [];
}

function completed(item: Item): SessionEvent[] {
	switch (item.type) {
		case 'agent_message':
			return [{ kind: 'text', text: item.text ?? '' }];
		case 'command_execution':
			return [
				{
					kind: 'tool.result',
					id: item.id,
					output: truncate(item.aggregated_output ?? ''),
					isError: item.exit_code !== 0
				}
			];
		case 'file_change': {
			const summary = (item.changes ?? []).map((c) => `${c.kind} ${c.path}`).join('\n');
			return [
				{ kind: 'tool', id: item.id, name: 'edit', input: summary },
				{ kind: 'tool.result', id: item.id, output: summary, isError: false }
			];
		}
		case 'mcp_tool_call': {
			// Named like Claude names MCP tools, so both agents' calls read the same.
			const name = `mcp__${item.server}__${item.tool}`;
			const texts = (item.result?.content ?? []).flatMap((part) => part.text ?? []);
			const output = item.error?.message ?? texts.join('\n');
			return [
				{ kind: 'tool', id: item.id, name, input: JSON.stringify(item.arguments ?? {}) },
				{ kind: 'tool.result', id: item.id, output: truncate(output), isError: !!item.error }
			];
		}
		case 'reasoning':
		case 'error': // non-fatal warnings, e.g. config problems
			return [];
		default:
			return [
				{ kind: 'tool', id: item.id, name: item.type, input: '' },
				{ kind: 'tool.result', id: item.id, output: truncate(JSON.stringify(item)), isError: false }
			];
	}
}

/** `codex exec --json`. */
export const codex: AgentAdapter = {
	command({ prompt, cwd, writableRoots, resumeId, api }) {
		const config = [
			'sandbox_mode="workspace-write"',
			// Commits in a worktree write to parts of the main repository's .git, outside the workspace.
			`sandbox_workspace_write.writable_roots=${JSON.stringify(writableRoots)}`
		];
		if (api)
			config.push(
				`mcp_servers.${API_SERVER}.url=${JSON.stringify(api.url)}`,
				`mcp_servers.${API_SERVER}.bearer_token_env_var="${API_TOKEN_ENV}"`
			);
		const options = ['--json', ...config.flatMap((entry) => ['-c', entry])];
		// `--` keeps user-provided values starting with `-` from being parsed as flags.
		const args = resumeId
			? ['exec', 'resume', ...options, '--', resumeId, prompt]
			: ['exec', ...options, '-C', cwd, '--', prompt];
		return { cmd: 'codex', args };
	},

	parse(raw) {
		const line = raw as Line;
		switch (line.type) {
			case 'thread.started':
				return line.thread_id ? [{ kind: 'resume', id: line.thread_id }] : [];
			case 'item.started':
				return line.item ? started(line.item) : [];
			case 'item.completed':
				return line.item ? completed(line.item) : [];
			case 'turn.completed':
				return [{ kind: 'turn.completed' }];
			case 'turn.failed':
				return [{ kind: 'turn.failed', error: line.error?.message ?? 'Turn failed' }];
			default:
				return []; // includes top-level `error`, which codex also emits for retried hiccups
		}
	}
};
