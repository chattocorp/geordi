import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SETTING, type AgentEvent, type Model } from '@geordi/protocol';
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

/**
 * Agents run unattended and need to commit, push and use `gh` (which needs the network), so
 * by default Codex runs without its sandbox. `GEORDI_CODEX_SANDBOX=workspace-write` puts it
 * back in: it can then only write to the worktree, and has no network.
 */
const sandboxed = process.env.GEORDI_CODEX_SANDBOX === 'workspace-write';

function started(item: Item): AgentEvent[] {
	if (item.type === 'command_execution')
		return [{ kind: 'tool', id: item.id, name: 'shell', input: item.command ?? '' }];
	return [];
}

function completed(item: Item): AgentEvent[] {
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

/**
 * Reads the models Codex offers from the list it keeps for its own model picker. That file
 * is Codex's business, not an interface: if it is missing or looks different, there are
 * simply no models to choose from, and Codex runs with the one it is configured for.
 */
export function modelsIn(cache: string): Model[] {
	try {
		const { models } = JSON.parse(cache) as {
			models: {
				slug: string;
				display_name?: string;
				visibility?: string;
				supported_reasoning_levels?: { effort: string }[];
			}[];
		};
		return models
			.filter((model) => model.visibility === 'list' && SETTING.test(model.slug))
			.map((model) => ({
				id: model.slug,
				name: model.display_name ?? model.slug,
				efforts: (model.supported_reasoning_levels ?? [])
					.map((level) => level.effort)
					.filter((effort) => SETTING.test(effort))
			}));
	} catch {
		return [];
	}
}

/** `codex exec --json`. */
export const codex: AgentAdapter = {
	offers() {
		let cache = '';
		try {
			const home = process.env.CODEX_HOME || join(homedir(), '.codex');
			cache = readFileSync(join(home, 'models_cache.json'), 'utf8');
		} catch {
			// no list: nothing to choose from
		}
		const models = modelsIn(cache);
		// without a model chosen, only what every model can do is safe to ask for
		const efforts = (models[0]?.efforts ?? []).filter((effort) =>
			models.every((model) => model.efforts.includes(effort))
		);
		return { models, efforts };
	},

	command({ prompt, cwd, writableRoots, resumeId, api, settings, instructions }) {
		const config = sandboxed
			? [
					'sandbox_mode="workspace-write"',
					// Commits in a worktree write to parts of the main repository's .git, outside the workspace.
					`sandbox_workspace_write.writable_roots=${JSON.stringify(writableRoots)}`
				]
			: [];
		// as configuration rather than flags: `exec resume` takes these too
		if (settings.model) config.push(`model=${JSON.stringify(settings.model)}`);
		if (settings.effort) config.push(`model_reasoning_effort=${JSON.stringify(settings.effort)}`);
		if (instructions) config.push(`developer_instructions=${JSON.stringify(instructions)}`);
		if (api)
			config.push(
				`mcp_servers.${API_SERVER}.url=${JSON.stringify(api.url)}`,
				`mcp_servers.${API_SERVER}.bearer_token_env_var="${API_TOKEN_ENV}"`
			);
		const options = [
			'--json',
			...(sandboxed ? [] : ['--dangerously-bypass-approvals-and-sandbox']),
			...config.flatMap((entry) => ['-c', entry])
		];
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
