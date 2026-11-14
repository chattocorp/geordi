import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { handleMcp } from './mcp.ts';
import { createRepos } from './repos.ts';
import { createWorkspaces } from './workspaces.ts';

function setup() {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);
	const store = new EventStore<GeordiEvent>(':memory:');
	const repos = createRepos(store);
	const workspaces = createWorkspaces(store, repos, () => true);
	const id = workspaces.create({
		repoId: repos.register(repoPath).id,
		agent: 'claude',
		prompt: 'Lead'
	});
	const caller = workspaces.get(id).sessions[0].id;

	let next = 0;
	const rpc = async (method: string, params?: unknown) =>
		(await handleMcp(workspaces.agents, caller, {
			jsonrpc: '2.0',
			id: ++next,
			method,
			params
		})) as { result?: unknown; error?: { code: number } };
	/** Calls a tool; returns its parsed result, or its error text. */
	const call = async (name: string, args: unknown = {}) => {
		const { content, isError } = (await rpc('tools/call', { name, arguments: args })).result as {
			content: { text: string }[];
			isError: boolean;
		};
		return isError ? { error: content[0].text } : JSON.parse(content[0].text);
	};
	return { workspaces, id, caller, rpc, call };
}

describe('the agent API as an MCP server', () => {
	it('introduces itself and lists its tools with JSON schemas', async () => {
		const { rpc } = setup();
		const init = await rpc('initialize', { protocolVersion: '2025-03-26' });
		expect(init.result).toMatchObject({
			protocolVersion: '2025-03-26',
			capabilities: { tools: {} },
			serverInfo: { name: 'geordi' }
		});

		const { tools } = (await rpc('tools/list')).result as {
			tools: { name: string; inputSchema: Record<string, unknown> }[];
		};
		expect(tools.map((tool) => tool.name)).toEqual([
			'start_agent',
			'wait_for_agent',
			'list_agents',
			'send_message',
			'stop_agent'
		]);
		expect(tools[0].inputSchema).toMatchObject({
			type: 'object',
			required: ['prompt'],
			properties: { worktree: { enum: ['own', 'shared'] }, agent: { enum: ['claude', 'codex'] } }
		});
	});

	it('ignores notifications and rejects unknown methods', async () => {
		const { workspaces, caller, rpc } = setup();
		const notification = { jsonrpc: '2.0', method: 'notifications/initialized' } as const;
		expect(await handleMcp(workspaces.agents, caller, notification)).toBeNull();
		expect(await rpc('resources/list')).toMatchObject({ error: { code: -32601 } });
	});

	it('starts, lists and waits for agents through tools', async () => {
		const { workspaces, id, caller, call } = setup();
		const child = await call('start_agent', { prompt: 'Review', worktree: 'shared' });
		expect(child).toMatchObject({ workspaceId: id, parentSessionId: caller, status: 'running' });

		workspaces.record(child.sessionId, { kind: 'text', text: 'LGTM' });
		workspaces.record(child.sessionId, { kind: 'turn.completed' });
		expect(await call('wait_for_agent', { session_id: child.sessionId })).toMatchObject({
			status: 'idle',
			reply: 'LGTM'
		});
		expect(await call('list_agents')).toHaveLength(1);
	});

	it('reports problems as tool errors the agent can read', async () => {
		const { call } = setup();
		// the default is a worktree of its own, which needs the caller's to exist
		expect(await call('start_agent', { prompt: 'Build' })).toEqual({
			error: 'Your workspace has no worktree yet'
		});
		expect((await call('start_agent', {})).error).toMatch(/Invalid input/);
		expect((await call('wait_for_agent', { session_id: 'nope' })).error).toMatch(/not started/);
		expect((await call('launch_missiles')).error).toMatch(/Unknown tool/);
	});
});
