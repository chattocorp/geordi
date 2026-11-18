import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
	CONFIG_SETTINGS,
	type Changes,
	type Harness,
	type RepoConfig,
	type Upstream
} from '@geordi/protocol';
import { error } from '@sveltejs/kit';
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
		settings: { model: 'opus', effort: 'high' },
		prompt: 'Lead'
	});
	/** What a daemon would offer; `null` as if none were connected. */
	const offered: { current: Harness[] | null } = {
		current: [
			{
				agent: 'claude',
				models: [
					{ id: 'opus', name: 'Opus', efforts: ['low', 'medium', 'high'] },
					{ id: 'haiku', name: 'Haiku', efforts: ['low'] }
				],
				efforts: ['low', 'medium', 'high']
			},
			{
				agent: 'codex',
				models: [{ id: 'gpt-5', name: 'GPT-5', efforts: ['minimal', 'high'] }],
				efforts: ['high']
			}
		]
	};

	const config: { current: RepoConfig } = {
		current: {
			jobs: [{ name: 'run', command: 'pnpm dev', needs: [], port: 20000, approved: true }],
			urls: [{ name: 'app', href: 'http://localhost:20000/', needs: ['run'] }],
			setup: { command: 'pnpm install', approved: true },
			teardown: null,
			ports: { first: 20000, count: 10 },
			problem: null,
			source: 'workspace',
			file: '.geordi.yml'
		}
	};
	/** How worktrees stand, as a daemon would say; set per test. None: no daemon can say. */
	const standings = new Map<string, { changes: Changes; upstream: Upstream | null }>();
	/** Archiving needs a daemon in real life; here it just happens, and is noted. */
	const archived: string[] = [];
	const agents = {
		...workspaces.agents,
		archive: async (actor: string, id: string) => {
			workspaces.archive(id, actor);
			archived.push(id);
		},
		/** What a daemon would read; set per test. */
		configuration: async () => config.current,
		standing: async (worktreeId: string) => {
			const standing = standings.get(worktreeId);
			if (!standing) throw error(502, 'No daemon is connected');
			return standing;
		},
		harnesses: () => offered.current
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
	return {
		store,
		repos,
		workspaces,
		agents,
		archived,
		caller,
		rpc,
		call,
		read,
		config,
		offered,
		standings
	};
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

describe('choosing what an agent runs', () => {
	const begun = () => {
		const it = setup();
		it.workspaces.record(it.caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const settingsOf = async (args: object) => {
			const started = await it.call('start_agent', { prompt: 'Review', ...args });
			return started.error ?? it.workspaces.get(started.id).settings;
		};
		return { ...it, settingsOf };
	};

	it('lists the models and effort levels on offer, per agent', async () => {
		const { rpc, offered } = begun();
		const describe = async () =>
			((await rpc('tools/list')).result as { tools: { description: string }[] }).tools[0]
				.description;
		const description = await describe();
		expect(description).toContain('- claude:\n  - opus (Opus): low, medium, high');
		expect(description).toContain('- codex:\n  - gpt-5 (GPT-5): minimal, high');

		offered.current = null;
		expect(await describe()).toMatch(/no daemon is connected/);
	});

	it('runs an agent of the same kind as its parent, but for what was asked', async () => {
		const { settingsOf } = begun();
		expect(await settingsOf({})).toEqual({ model: 'opus', effort: 'high' });
		expect(await settingsOf({ effort: 'medium' })).toEqual({ model: 'opus', effort: 'medium' });
		// the parent's effort goes with another model only if it offers it
		expect(await settingsOf({ model: 'haiku' })).toEqual({ model: 'haiku' });
		// another kind inherits nothing
		expect(await settingsOf({ agent: 'codex' })).toEqual({});
		expect(await settingsOf({ agent: 'codex', model: 'gpt-5', effort: 'minimal' })).toEqual({
			model: 'gpt-5',
			effort: 'minimal'
		});
	});

	it('refuses an effort the model does not offer, and says what it does', async () => {
		const { settingsOf, offered } = begun();
		expect(await settingsOf({ model: 'haiku', effort: 'high' })).toBe(
			'haiku (claude) offers no effort high; it offers low'
		);
		expect(await settingsOf({ effort: 'max; rm -rf /' })).toMatch(/not an effort level/);
		// what is not known is not checked
		offered.current = null;
		expect(await settingsOf({ model: 'haiku', effort: 'high' })).toEqual({
			model: 'haiku',
			effort: 'high'
		});
	});
});

describe('configuring the repository', () => {
	it('explains every setting there is, as plain text', async () => {
		const { read } = setup();
		const reference = await read('configuration_reference');
		expect(reference).toContain('# .geordi.yml');
		expect(reference).toContain('```yaml');
		for (const [key, { example }] of Object.entries(CONFIG_SETTINGS)) {
			expect(reference).toContain(`\`${key}\``);
			expect(reference).toContain(example);
		}
		expect(reference).toContain('check_configuration');
	});

	it('reports the first URL, then the first job, when Run has no configured default', async () => {
		const { call, config } = setup();
		expect(await call('check_configuration')).toMatchObject({
			default: 'urls.app',
			defaultSource: 'first URL'
		});
		config.current.urls = [];
		expect(await call('check_configuration')).toMatchObject({
			default: 'jobs.run',
			defaultSource: 'first job'
		});
		config.current.jobs = [];
		expect(await call('check_configuration')).not.toHaveProperty('default');
	});

	it('says which file applies, what it sets, and what is wrong with it', async () => {
		const { call, config } = setup();
		config.current.default = 'urls.app';
		expect(await call('check_configuration')).toEqual({
			default: 'urls.app',
			defaultSource: 'configured',
			applies: 'the .geordi.yml in your working directory',
			problem: null,
			ports: { first: 20000, count: 10 },
			jobs: [{ name: 'run', command: 'pnpm dev', needs: [], port: 20000 }],
			urls: [{ name: 'app', href: 'http://localhost:20000/', needs: ['run'] }],
			setup: 'pnpm install',
			teardown: null
		});

		// a command nobody has agreed to yet: the agent is told that it can't do that itself
		config.current.jobs[0].approved = false;
		expect((await call('check_configuration')).note).toMatch(/cannot agree/);

		const none = {
			jobs: [],
			urls: [],
			setup: null,
			teardown: null,
			ports: { first: 20000, count: 10 }
		};
		// one still written in TOML is read, and the agent told to move on
		config.current = {
			...none,
			problem: '.geordi.toml: invalid value',
			source: 'workspace',
			file: '.geordi.toml'
		};
		expect(await call('check_configuration')).toMatchObject({
			applies: expect.stringMatching(
				/^the \.geordi\.toml \(still read, but \.geordi\.yml is what to write/
			),
			problem: '.geordi.toml: invalid value',
			jobs: []
		});

		config.current = { ...none, problem: null, source: null, file: null };
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
			'list_workspaces',
			'read_workspace',
			'send_message',
			'archive_agent',
			'configuration_reference',
			'check_configuration',
			'workspace_status',
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

describe('workspace status', () => {
	const changes = (over: Partial<Changes> = {}): Changes => ({
		files: [],
		uncommitted: 0,
		branch: 'geordi/lead',
		unpushed: 0,
		landed: false,
		...over
	});
	const upstream = (pull: Partial<NonNullable<Upstream['pull']>> | null): Upstream => ({
		forge: 'github',
		repo: 'acme/app',
		repoUrl: 'https://github.com/acme/app',
		branch: 'geordi/lead',
		pushed: true,
		createUrl: null,
		pull: pull && {
			number: '7',
			title: 'Speed up the tests',
			url: 'https://github.com/acme/app/pull/7',
			state: 'open',
			draft: false,
			base: 'main',
			checks: null,
			review: null,
			...pull
		}
	});
	const file = { path: 'a.ts', status: 'modified' } as Changes['files'][number];

	it("says how the caller's own workspace stands, and what to do next", async () => {
		const { caller, call, standings } = setup();
		standings.set(caller, {
			changes: changes({ files: [file] }),
			upstream: upstream({
				checks: { state: 'failure', total: 3, failed: 1, url: null }
			})
		});
		const status = await call('workspace_status');
		expect(status).toMatchObject({
			id: caller,
			branch: 'geordi/lead',
			standing: 'Checks failing',
			changes: { files: 1, uncommitted: 0 },
			upstream: { pull: { number: '7', checks: { state: 'failure', total: 3, failed: 1 } } }
		});
		expect(status.next.map((step: { id: string }) => step.id)).toEqual(['fix-checks']);
		expect(status.next[0].prompt).toMatch(/checks on pull request #7 are failing/);
	});

	it('leaves out the prompt of a step the person takes', async () => {
		const { caller, call, standings } = setup();
		standings.set(caller, { changes: changes({ files: [file] }), upstream: upstream({}) });
		expect(await call('workspace_status')).toMatchObject({
			standing: 'Ready to merge',
			next: [{ id: 'merge-pull', label: 'Merge PR' }]
		});
		expect((await call('workspace_status')).next[0]).not.toHaveProperty('prompt');
	});

	it('reports standings across the repository', async () => {
		const { workspaces, caller, call, standings } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = await call('start_agent', { prompt: 'Review', worktree: 'shared' });
		// it works in the caller's worktree: how that stands is how it stands
		standings.set(caller, { changes: changes({ uncommitted: 2 }), upstream: null });
		expect(await call('workspace_status', { agent_id: child.id })).toMatchObject({
			id: child.id,
			standing: 'Uncommitted changes',
			upstream: null,
			next: [{ id: 'commit' }]
		});

		const stranger = workspaces.create({
			repoId: workspaces.get(caller).repoId,
			agent: 'claude',
			settings: {},
			prompt: 'Unrelated'
		});
		standings.set(stranger, { changes: changes({ uncommitted: 1 }), upstream: null });
		expect(await call('workspace_status', { agent_id: stranger })).toMatchObject({ id: stranger });
	});

	it('says so when no daemon can tell', async () => {
		const { call } = setup();
		expect((await call('workspace_status')).error).toMatch(/No daemon/);
	});
});

describe('repository access', () => {
	it('lets peers read and send while reserving lifecycle control for descendants', async () => {
		const { workspaces, caller, call } = setup();
		const repoId = workspaces.get(caller).repoId;
		const peer = workspaces.create({ repoId, agent: 'codex', prompt: 'Review the change' });
		expect(await call('list_workspaces')).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: peer, repoId })])
		);
		await call('send_message', { agent_id: peer, message: 'Check the migration', interrupt: true });
		expect((await call('read_workspace', { workspace_id: peer })).messages.at(-1)).toMatchObject({
			kind: 'user',
			from: caller,
			text: 'Check the migration'
		});
		expect((await call('stop_agent', { agent_id: peer })).error).toBeTruthy();
		expect((await call('archive_agent', { agent_id: peer })).error).toBeTruthy();
	});
	it('reads archived pages without restarting the agent', async () => {
		const { workspaces, caller, call } = setup();
		const peer = workspaces.create({
			repoId: workspaces.get(caller).repoId,
			agent: 'claude',
			prompt: 'First'
		});
		for (let i = 0; i < 51; i++) workspaces.record(peer, { kind: 'text', text: String(i) });
		workspaces.record(peer, { kind: 'turn.completed' });
		workspaces.archive(peer);
		expect((await call('list_workspaces')).map((w: { id: string }) => w.id)).not.toContain(peer);
		expect(await call('list_workspaces', { include_archived: true })).toContainEqual(
			expect.objectContaining({ id: peer, archivedAt: expect.any(String) })
		);
		const latest = await call('read_workspace', { workspace_id: peer });
		expect(latest.messages).toHaveLength(50);
		expect(
			(await call('read_workspace', { workspace_id: peer, before: latest.before })).messages[0]
		).toMatchObject({ kind: 'user', text: 'First' });
		expect((await call('send_message', { agent_id: peer, message: 'Go' })).error).toMatch(
			/archived/
		);
	});

	it('retains a repository grant on replay, scopes tools and targets, and honors revocation', async () => {
		const { store, repos, workspaces, agents, caller } = setup();
		const repoId = workspaces.get(caller).repoId;
		const path = mkdtempSync(join(tmpdir(), 'geordi-other-'));
		execFileSync('git', ['init', '-q', path]);
		const other = workspaces.create({
			repoId: repos.register(path).id,
			agent: 'codex',
			prompt: 'Private'
		});
		const token = workspaces.access.issue(repoId, 'Release assistant');
		const actor = agents.authenticate(token)!;
		expect(actor).toBeTruthy();
		const rpc = (method: string, params?: unknown) =>
			handleMcp(agents, actor, { jsonrpc: '2.0', id: 1, method, params });
		expect(await rpc('tools/list')).toMatchObject({
			result: {
				tools: [
					{ name: 'list_workspaces' },
					{ name: 'read_workspace' },
					{ name: 'send_message' },
					{ name: 'workspace_status' }
				]
			}
		});
		expect(JSON.stringify(await rpc('tools/call', { name: 'list_workspaces' }))).not.toContain(
			other
		);
		for (const [name, args] of [
			['stop_agent', { agent_id: caller }],
			['start_agent', { prompt: 'Hello' }],
			['read_workspace', { workspace_id: other }],
			['send_message', { agent_id: other, message: 'Hello' }]
		]) {
			expect(await rpc('tools/call', { name, arguments: args })).toMatchObject({
				result: { isError: true }
			});
		}
		await rpc('tools/call', {
			name: 'send_message',
			arguments: { agent_id: caller, message: 'Check the build', interrupt: true }
		});
		const replay = createWorkspaces(store, repos, () => true);
		expect(replay.agents.authenticate(token)).toBe(actor);
		expect(replay.get(caller).transcript.at(-1)).toMatchObject({
			from: actor,
			senderName: 'Release assistant'
		});
		expect(JSON.stringify(store.readAll())).not.toContain(token);
		replay.access.revoke(actor);
		expect(replay.agents.authenticate(token)).toBeNull();
	});
});
