import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CONFIG_SETTINGS, type RepoConfig } from '@geordi/protocol';
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
	const caller = workspaces.create({
		repoId: repos.register(repoPath).id,
		agent: 'claude',
		prompt: 'Lead'
	});

	const config: { current: RepoConfig } = {
		current: {
			jobs: [{ name: 'run', command: 'pnpm dev', needs: [], port: 20000, approved: true }],
			urls: [{ name: 'app', href: 'http://localhost:20000/', needs: ['run'] }],
			ports: { first: 20000, count: 10 },
			problem: null,
			source: 'workspace'
		}
	};
	/** Archiving needs a daemon in real life; here it just happens, and is noted. */
	const archived: string[] = [];
	const agents = {
		...workspaces.agents,
		archive: async (actor: string, id: string) => {
			workspaces.archive(id, actor);
			archived.push(id);
		},
		/** What a daemon would read; set per test. */
		configuration: async () => config.current
	};

	let next = 0;
	const rpc = async (method: string, params?: unknown) =>
		(await handleMcp(agents, caller, {
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
	/** Calls a tool whose result is text to read. */
	const read = async (name: string) =>
		((await rpc('tools/call', { name, arguments: {} })).result as { content: { text: string }[] })
			.content[0].text;
	return { workspaces, agents, archived, caller, rpc, call, read, config };
}

describe('naming workspaces', () => {
	it('lets an agent name its own workspace, a few times at most', async () => {
		const { workspaces, caller, call } = setup();
		expect(await call('name_workspace', { title: '  "Speed up the test suite."  ' })).toEqual({
			title: 'Speed up the test suite'
		});
		expect(workspaces.get(caller)).toMatchObject({ title: 'Speed up the test suite', named: true });

		await call('name_workspace', { title: 'Second thoughts' });
		await call('name_workspace', { title: 'Third time lucky' });
		expect((await call('name_workspace', { title: 'And again' })).error).toMatch(/keeps its name/);
		expect(workspaces.get(caller).title).toBe('Third time lucky');
	});

	it('lets an agent name the agents it starts', async () => {
		const { workspaces, caller, call } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const named = await call('start_agent', {
			prompt: 'Look through the fixtures for anything that takes long to set up.',
			title: 'Find slow fixtures'
		});
		expect(workspaces.get(named.id)).toMatchObject({ title: 'Find slow fixtures', named: true });

		// without one, it is named after its task, until someone knows better
		const unnamed = await call('start_agent', { prompt: 'Review the changes' });
		expect(workspaces.get(unnamed.id)).toMatchObject({ title: 'Review the changes', named: false });
	});
});

describe('configuring the repository', () => {
	it('explains every setting there is, as plain text', async () => {
		const { read } = setup();
		const reference = await read('configuration_reference');
		expect(reference).toContain('# .geordi.toml');
		for (const [key, { example }] of Object.entries(CONFIG_SETTINGS)) {
			expect(reference).toContain(`\`${key}\``);
			expect(reference).toContain(example);
		}
		expect(reference).toContain('check_configuration');
	});

	it('says which file applies, what it sets, and what is wrong with it', async () => {
		const { call, config } = setup();
		expect(await call('check_configuration')).toEqual({
			applies: 'the .geordi.toml in your working directory',
			problem: null,
			ports: { first: 20000, count: 10 },
			jobs: [{ name: 'run', command: 'pnpm dev', needs: [], port: 20000 }],
			urls: [{ name: 'app', href: 'http://localhost:20000/', needs: ['run'] }]
		});

		// a command nobody has agreed to yet: the agent is told that it can't do that itself
		config.current.jobs[0].approved = false;
		expect((await call('check_configuration')).note).toMatch(/cannot agree/);

		const none = { jobs: [], urls: [], ports: { first: 20000, count: 10 } };
		config.current = { ...none, problem: '.geordi.toml: invalid value', source: 'workspace' };
		expect(await call('check_configuration')).toMatchObject({
			problem: '.geordi.toml: invalid value',
			jobs: []
		});

		config.current = { ...none, problem: null, source: null };
		expect((await call('check_configuration')).applies).toMatch(/^none/);
	});
});

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
			'name_workspace',
			'wait_for_agent',
			'list_agents',
			'send_message',
			'archive_agent',
			'configuration_reference',
			'check_configuration',
			'stop_agent'
		]);
		expect(tools[0].inputSchema).toMatchObject({
			type: 'object',
			required: ['prompt'],
			properties: { worktree: { enum: ['own', 'shared'] }, agent: { enum: ['claude', 'codex'] } }
		});
	});

	it('ignores notifications and rejects unknown methods', async () => {
		const { agents, caller, rpc } = setup();
		const notification = { jsonrpc: '2.0', method: 'notifications/initialized' } as const;
		expect(await handleMcp(agents, caller, notification)).toBeNull();
		expect(await rpc('resources/list')).toMatchObject({ error: { code: -32601 } });
	});

	it('starts, lists and waits for agents through tools', async () => {
		const { workspaces, caller, call } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = await call('start_agent', { prompt: 'Review', worktree: 'shared' });
		expect(child).toMatchObject({ parentId: caller, sharesWorktree: true, status: 'running' });

		workspaces.record(child.id, { kind: 'text', text: 'LGTM' });
		workspaces.record(child.id, { kind: 'turn.completed' });
		expect(await call('wait_for_agent', { agent_id: child.id })).toMatchObject({
			status: 'idle',
			reply: 'LGTM'
		});
		expect(await call('list_agents')).toHaveLength(1);
	});

	it('lets an agent archive the agents it started, and no others', async () => {
		const { workspaces, archived, caller, call } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = await call('start_agent', { prompt: 'Build', worktree: 'own' });

		// still working
		expect((await call('archive_agent', { agent_id: child.id })).error).toMatch(/Stop the agent/);
		workspaces.record(child.id, { kind: 'turn.completed' });
		expect(await call('archive_agent', { agent_id: child.id })).toEqual({ archived: child.id });
		expect(archived).toEqual([child.id]);
		expect(await call('list_agents')).toEqual([]);

		// not its own, and not itself
		expect((await call('archive_agent', { agent_id: caller })).error).toMatch(/not started/);
	});

	it('reports problems as tool errors the agent can read', async () => {
		const { call } = setup();
		// the default is a worktree of its own, which needs the caller's to exist
		expect(await call('start_agent', { prompt: 'Build' })).toEqual({
			error: 'Your workspace has no worktree yet'
		});
		expect((await call('start_agent', {})).error).toMatch(/Invalid input/);
		expect((await call('wait_for_agent', { agent_id: 'nope' })).error).toMatch(/not started/);
		expect((await call('launch_missiles')).error).toMatch(/Unknown tool/);
	});
});
