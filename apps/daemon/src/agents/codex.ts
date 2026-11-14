import type { SessionEvent } from '@geordi/protocol';
import { truncate, type AgentAdapter } from './adapter.ts';

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
	command({ prompt, cwd, gitDir, resumeId }) {
		// Commits in a worktree write to the main repository's .git, outside the sandbox's workspace.
		const writable = `sandbox_workspace_write.writable_roots=${JSON.stringify([gitDir])}`;
		// `--` keeps user-provided values starting with `-` from being parsed as flags.
		const args = resumeId
			? [
					'exec',
					'resume',
					'--json',
					'-c',
					'sandbox_mode="workspace-write"',
					'-c',
					writable,
					'--',
					resumeId,
					prompt
				]
			: ['exec', '--json', '-s', 'workspace-write', '--add-dir', gitDir, '-C', cwd, '--', prompt];
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
