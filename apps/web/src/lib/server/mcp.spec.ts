import { createHash } from 'node:crypto';
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

function gitRepository() {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);
	return repoPath;
}

function setup() {
	const repoPath = gitRepository();
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
			tasks: [
				{
					name: 'web',
					command: 'pnpm dev',
					approved: true,
					ports: [{ name: 'http', port: 20000 }],
					href: 'http://localhost:20000/',
					needs: [],
					default: true
				}
			],
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
		harnesses: () => offered.current,
		// a daemon would say first whether there is such a branch
		setBase: async (id: string, base: string | null) => workspaces.setBase(id, base, id)
	};

	let next = 0;
	const rpcAs = (actor: string) => async (method: string, params?: unknown) =>
		(await handleMcp(agents, actor, {
			jsonrpc: '2.0',
			id: ++next,
			method,
			params
		})) as { result?: unknown; error?: { code: number } };
	/** Calls a tool as `actor`; returns its parsed result, or its error text. */
	const callAs =
		(actor: string) =>
		async (name: string, args: unknown = {}) => {
			const { content, isError } = (await rpcAs(actor)('tools/call', { name, arguments: args }))
				.result as { content: { text: string }[]; isError: boolean };
			return isError ? { error: content[0].text } : JSON.parse(content[0].text);
		};
	const rpc = rpcAs(caller);
	const call = callAs(caller);
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
		rpcAs,
		call,
		callAs,
		read,
		config,
		offered,
		standings
	};
}

describe('setting the base', () => {
	it('lets an agent say which branch its work is compared with', async () => {
		const { workspaces, store, caller, rpc } = setup();
		const text = async (args: unknown) =>
			(
				(await rpc('tools/call', { name: 'set_base', arguments: args })).result as {
					content: { text: string }[];
				}
			).content[0].text;

		expect(await text({ branch: 'release/2' })).toMatch(/compared with release\/2/);
		expect(workspaces.get(caller).base).toBe('release/2');
		expect(store.readStream(`workspace:${caller}`).at(-1)).toMatchObject({
			type: 'workspace.based',
			actor: caller
		});

		expect(workspaces.get(caller).transcript.at(-1)).toMatchObject({
			kind: 'note',
			text: 'Now compared with release/2, as Lead said'
		});

		expect(await text({})).toMatch(/main branch/);
		expect(workspaces.get(caller).base).toBeNull();
		expect(await text({ branch: '--force' })).toMatch(/not a branch name/);
	});
});

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

	it('can start with only Codex installed and reports a missing provider before starting', async () => {
		const { settingsOf, offered } = begun();
		offered.current = offered.current!.filter((offer) => offer.agent === 'codex');
		expect(await settingsOf({})).toEqual({});
		expect(await settingsOf({ agent: 'claude' })).toBe('Provider claude is unavailable');
		offered.current = [];
		expect(await settingsOf({})).toBe('No providers are available');
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

	it('says which file applies, what it sets, and what is wrong with it', async () => {
		const { call, config } = setup();
		expect(await call('check_configuration')).toEqual({
			applies: 'the .geordi.yml in your working directory',
			problem: null,
			spare_ports: { first: 20000, count: 10 },
			tasks: [
				{
					name: 'web',
					command: 'pnpm dev',
					ports: [{ name: 'http', port: 20000 }],
					url: 'http://localhost:20000/',
					needs: [],
					default: true
				}
			],
			setup: 'pnpm install',
			teardown: null
		});

		// a command nobody has agreed to yet: the agent is told that it can't do that itself
		config.current.tasks[0].approved = false;
		expect((await call('check_configuration')).note).toMatch(/cannot agree/);

		const none = { tasks: [], setup: null, teardown: null, ports: { first: 20000, count: 10 } };
		// one by the old name says so
		config.current = {
			...none,
			problem: '.geordi.toml is no longer read: write its settings as YAML in .geordi.yml',
			source: 'workspace',
			file: '.geordi.toml'
		};
		expect(await call('check_configuration')).toMatchObject({
			applies: 'the .geordi.toml in your working directory',
			problem: expect.stringMatching(/no longer read/),
			tasks: []
		});

		config.current = { ...none, problem: null, source: null, file: null };
		expect((await call('check_configuration')).applies).toMatch(/^none/);

		// the sections, where there are any
		expect(await call('check_configuration')).not.toHaveProperty('sections');
		config.current = { ...config.current, sections: [{ path: 'docs', title: 'Docs' }] };
		expect((await call('check_configuration')).sections).toEqual([{ path: 'docs', title: 'Docs' }]);
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
			'set_base',
			'wait_for_agent',
			'list_agents',
			'list_repositories',
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
			properties: {
				worktree: { enum: ['own', 'shared'] },
				agent: { enum: ['claude', 'codex', 'opencode'] }
			}
		});
	});

	it('advertises the start locations and supervision scope available to each caller', async () => {
		const { caller, rpcAs, workspaces } = setup();
		const project = workspaces.create({ repoId: null, agent: 'claude', prompt: 'Coordinate' });
		const token = workspaces.access.issue('Client', [workspaces.get(caller).repoId!]);
		const external = workspaces.agents.authenticate(token)!;
		const catalog = async (actor: string) => {
			const { tools } = (await rpcAs(actor)('tools/list')).result as {
				tools: {
					name: string;
					description: string;
					inputSchema: { required?: string[]; properties: Record<string, unknown> };
				}[];
			};
			return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
		};
		const repoTools = await catalog(caller);
		const projectTools = await catalog(project);
		const clientTools = await catalog(external);
		expect(repoTools.start_agent.inputSchema.properties).toHaveProperty('repository');
		expect(repoTools.start_agent.inputSchema.properties).toHaveProperty('workspace');
		expect(projectTools.start_agent.inputSchema.properties).toHaveProperty('workspace');
		expect(projectTools.start_agent.description).toContain('regardless of worktree mode');
		expect(clientTools.start_agent.inputSchema.required).toContain('repository');
		expect(clientTools.start_agent.inputSchema.properties.worktree).toMatchObject({ const: 'own' });
		expect(clientTools.start_agent.inputSchema.properties).not.toHaveProperty('workspace');
		expect(clientTools.send_message.description).toContain(
			'only your own direct or indirect descendants'
		);
		expect(repoTools.send_message.description).toContain('or to the agent that started you');
		for (const name of ['send_message', 'stop_agent', 'archive_agent'])
			expect(projectTools[name].description).toContain(
				'any agent in a repository or in your project'
			);
		expect(repoTools.archive_agent.description).toContain('earlier workspaces stay archived');
		expect(projectTools.archive_agent.description).toContain('preserves the folder');
		expect(clientTools.workspace_status.inputSchema.required).toContain('workspace_id');
		expect(projectTools.workspace_status.inputSchema.required).toContain('workspace_id');
		expect(repoTools.workspace_status.inputSchema.required ?? []).not.toContain('workspace_id');
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
		expect(await call('wait_for_agent', { workspace_id: child.id })).toMatchObject({
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
		expect((await call('archive_agent', { workspace_id: child.id })).error).toMatch(
			/Stop the agent/
		);
		workspaces.record(child.id, { kind: 'turn.completed' });
		expect(await call('archive_agent', { workspace_id: child.id })).toEqual({ archived: child.id });
		expect(archived).toEqual([child.id]);
		expect(await call('list_agents')).toEqual([]);

		// not its own, and not itself
		expect((await call('archive_agent', { workspace_id: caller })).error).toMatch(/not started/);
	});

	it('reports problems as tool errors the agent can read', async () => {
		const { call } = setup();
		// a shared worktree has its own base already
		expect(
			await call('start_agent', { prompt: 'Build', worktree: 'shared', base: 'main' })
		).toEqual({ error: 'A base is for a new worktree; a shared one keeps its own' });
		expect((await call('start_agent', {})).error).toBe('Invalid input: Missing parameter prompt');
		expect((await call('read_workspace', { workspace_id: 7 })).error).toMatch(
			/^Invalid input: workspace_id: Invalid type/
		);
		// a misspelt parameter is refused, not quietly dropped
		expect(await call('start_agent', { prompt: 'Build', kind: 'codex' })).toEqual({
			error: 'Invalid input: Unknown parameter kind'
		});
		expect((await call('wait_for_agent', { workspace_id: 'nope' })).error).toMatch(/not found/);
		expect((await call('send_message', { workspace_id: 'nope', message: 'Hi' })).error).toMatch(
			/not found/
		);
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

	it('says whether the person put a workspace aside, there and in the list', async () => {
		const { workspaces, caller, call, standings } = setup();
		standings.set(caller, { changes: changes({}), upstream: null });
		expect(await call('workspace_status')).toMatchObject({ inactive: false });
		workspaces.setInactive(caller, true);
		expect(await call('workspace_status')).toMatchObject({ inactive: true });
		expect(await call('list_workspaces')).toContainEqual(
			expect.objectContaining({ id: caller, inactive: true })
		);
	});

	it('reports standings across the repository', async () => {
		const { workspaces, caller, call, standings } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = await call('start_agent', { prompt: 'Review', worktree: 'shared' });
		// it works in the caller's worktree: how that stands is how it stands
		standings.set(caller, { changes: changes({ uncommitted: 2 }), upstream: null });
		expect(await call('workspace_status', { workspace_id: child.id })).toMatchObject({
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
		expect(await call('workspace_status', { workspace_id: stranger })).toMatchObject({
			id: stranger
		});
	});

	it('says so when no daemon can tell', async () => {
		const { call } = setup();
		expect((await call('workspace_status')).error).toMatch(/No daemon/);
	});
});

describe('installation-wide workspace access', () => {
	it('lets agents read and wait on peers across repositories, but not message them', async () => {
		const { repos, workspaces, caller, call } = setup();
		const repoId = repos.register(gitRepository()).id;
		const peer = workspaces.create({ repoId, agent: 'codex', prompt: 'Review the change' });
		expect(await call('list_workspaces')).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: peer, repoId })])
		);
		expect((await call('read_workspace', { workspace_id: peer })).turns.at(-1)).toMatchObject({
			message: 'Review the change',
			reply: ''
		});
		workspaces.record(peer, { kind: 'turn.completed' });
		expect(await call('wait_for_agent', { workspace_id: peer })).toMatchObject({ status: 'idle' });

		expect(
			(await call('send_message', { workspace_id: peer, message: 'Which version?' })).error
		).toMatch(/only the agents you started/);
		expect(workspaces.get(peer).status).toBe('idle');
		expect((await call('send_message', { workspace_id: caller, message: 'Me' })).error).toMatch(
			/only the agents you started/
		);
		expect((await call('start_agent', { workspace: peer, prompt: 'Review' })).error).toMatch(
			/not started/
		);
		expect((await call('stop_agent', { workspace_id: peer })).error).toBeTruthy();
		expect((await call('archive_agent', { workspace_id: peer })).error).toBeTruthy();
	});

	it('lets agents message along their own line: descendants down, their parent up', async () => {
		const { workspaces, caller, call, callAs } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = await call('start_agent', { prompt: 'Split the work', worktree: 'shared' });
		const grandchild = await callAs(child.id)('start_agent', {
			prompt: 'Do a part',
			workspace: child.id
		});
		const sibling = await call('start_agent', { prompt: 'Other work', worktree: 'shared' });
		for (const { id } of [child, grandchild, sibling])
			workspaces.record(id, { kind: 'turn.completed' });

		expect(
			await call('send_message', { workspace_id: grandchild.id, message: 'Also the docs' })
		).toMatchObject({ status: 'running' });
		expect(workspaces.get(grandchild.id).transcript.at(-1)).toMatchObject({
			from: caller,
			text: 'Also the docs'
		});

		const fromChild = callAs(child.id);
		expect(
			(await fromChild('send_message', { workspace_id: sibling.id, message: 'Hi' })).error
		).toMatch(/only the agents you started/);
		await fromChild('send_message', { workspace_id: caller, message: 'Which approach?' });
		expect(workspaces.get(caller).transcript.at(-1)).toMatchObject({
			from: child.id,
			text: 'Which approach?'
		});
		await fromChild('send_message', {
			workspace_id: caller,
			message: 'Next task',
			interrupt: false
		});
		expect(workspaces.get(caller).queue).toEqual(['Next task']);

		const fromGrandchild = callAs(grandchild.id);
		expect(
			(await fromGrandchild('send_message', { workspace_id: caller, message: 'Hi' })).error
		).toMatch(/only the agents you started/);
	});

	it('starts a child from the target repository base in its own worktree', async () => {
		const { store, repos, workspaces, caller, call } = setup();
		const repo = repos.register(gitRepository());
		const task = { prompt: 'Update the client', repository: repo.id };
		expect((await call('start_agent', { ...task, worktree: 'shared' })).error).toMatch(/shared/);
		const child = await call('start_agent', task);
		expect(workspaces.get(child.id)).toMatchObject({
			parentId: caller,
			repoId: repo.id,
			worktreeId: child.id,
			base: null
		});
		const reviewer = await call('start_agent', {
			workspace: child.id,
			prompt: 'Review the client changes'
		});
		expect(reviewer).toMatchObject({ parentId: caller, sharesWorktree: true });
		const replay = createWorkspaces(store, repos, () => true);
		expect(replay.ref(reviewer.id)).toEqual(replay.ref(child.id));
		expect(replay.ref(child.id)).toEqual({
			repoPath: repo.path,
			worktreeParent: repo.id,
			worktreeId: child.id
		});
		expect(replay.agents.get(caller, child.id)).toMatchObject({ parentId: caller });
	});

	it('reads archived pages without restarting the agent', async () => {
		const { workspaces, caller, call } = setup();
		workspaces.record(caller, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const { id: peer } = await call('start_agent', { prompt: 'First', worktree: 'shared' });
		workspaces.record(peer, { kind: 'turn.completed' });
		for (let i = 0; i < 50; i++) {
			workspaces.agents.send(caller, peer, `Again ${i}`, false);
			workspaces.record(peer, { kind: 'text', text: 'Thinking' });
			workspaces.record(peer, { kind: 'text', text: `Done ${i}` });
			workspaces.record(peer, { kind: 'turn.completed' });
		}
		workspaces.archive(peer);
		expect((await call('list_workspaces')).map((w: { id: string }) => w.id)).not.toContain(peer);
		expect(await call('list_workspaces', { include_archived: true })).toContainEqual(
			expect.objectContaining({ id: peer, archivedAt: expect.any(String) })
		);
		const latest = await call('read_workspace', { workspace_id: peer });
		expect(latest.turns).toHaveLength(50);
		expect(latest.turns.at(-1)).toMatchObject({ message: 'Again 49', reply: 'Done 49' });
		expect(
			(await call('read_workspace', { workspace_id: peer, before: latest.before })).turns
		).toMatchObject([{ message: 'First', reply: '' }]);
	});

	it('uses one external token across the repositories it was granted, retains it on replay, and honors revocation', async () => {
		const { store, repos, workspaces, agents, rpcAs, callAs, caller } = setup();
		const otherRepo = repos.register(gitRepository()).id;
		const hiddenRepo = repos.register(gitRepository()).id;
		const token = workspaces.access.issue('Release assistant', [
			workspaces.get(caller).repoId!,
			otherRepo
		]);
		const other = workspaces.create({ repoId: otherRepo, agent: 'codex', prompt: 'Test it' });
		const hidden = workspaces.create({ repoId: hiddenRepo, agent: 'codex', prompt: 'Secret' });
		const later = repos.register(gitRepository()).id;
		const actor = agents.authenticate(token)!;
		expect(actor).toBeTruthy();
		const call = callAs(actor);
		const { result } = (await rpcAs(actor)('tools/list')) as {
			result: { tools: { name: string }[] };
		};
		expect(result.tools.map((tool) => tool.name)).not.toEqual(
			expect.arrayContaining(['name_workspace'])
		);
		const listed = JSON.stringify(await call('list_workspaces'));
		for (const id of [caller, other]) {
			expect(listed).toContain(id);
			expect(await call('read_workspace', { workspace_id: id })).not.toHaveProperty('error');
		}

		// a repository it was not granted, or that was added later, doesn't exist for it
		expect(listed).not.toContain(hidden);
		const repoIds = (await call('list_repositories')).map((repo: { id: string }) => repo.id);
		expect(repoIds).toEqual(expect.arrayContaining([otherRepo]));
		expect(repoIds).not.toEqual(expect.arrayContaining([hiddenRepo]));
		expect(repoIds).not.toEqual(expect.arrayContaining([later]));
		for (const [tool, input] of [
			['read_workspace', { workspace_id: hidden }],
			['workspace_status', { workspace_id: hidden }],
			['wait_for_agent', { workspace_id: hidden, timeout_seconds: 0 }],
			['send_message', { workspace_id: hidden, message: 'Hi' }],
			['start_agent', { prompt: 'Fix it', repository: later }]
		] as const)
			expect((await call(tool, input)).error).toMatch(/not found|access to/);
		expect(workspaces.get(hidden).queue).toEqual([]);

		expect((await call('workspace_status')).error).toMatch(/Say which workspace/);
		expect((await call('stop_agent', { workspace_id: other })).error).toBeTruthy();

		// a person's agent at work is not turned around; the message waits for its turn to end
		expect(
			(await call('send_message', { workspace_id: other, message: 'Now', interrupt: true })).error
		).toMatch(/only interrupt agents you started/);
		await call('send_message', { workspace_id: other, message: 'Check the build' });
		expect(workspaces.get(other).queue).toEqual(['Check the build']);
		workspaces.record(other, { kind: 'turn.completed' });

		const replay = createWorkspaces(store, repos, () => true);
		expect(replay.agents.authenticate(token)).toBe(actor);
		expect(replay.get(other).transcript.at(-1)).toMatchObject({
			from: actor,
			senderName: 'Release assistant'
		});
		expect(JSON.stringify(store.readAll())).not.toContain(token);
		replay.access.revoke(actor);
		expect(replay.agents.authenticate(token)).toBeNull();
		expect(() => replay.access.revoke(actor)).toThrow();
	});

	it('lets an external client start agents in a repository, and supervise those', async () => {
		const { repos, workspaces, agents, archived, callAs } = setup();
		const repoId = repos.register(gitRepository()).id;
		const actor = agents.authenticate(workspaces.access.issue('Desktop', [repoId]))!;
		const call = callAs(actor);

		expect(await call('list_repositories')).toContainEqual(expect.objectContaining({ id: repoId }));
		expect((await call('start_agent', { prompt: 'Fix it' })).error).toMatch(/which repository/);
		expect(
			(await call('start_agent', { prompt: 'Fix it', repository: repoId, worktree: 'shared' }))
				.error
		).toMatch(/share/);

		const started = await call('start_agent', {
			prompt: 'Fix the flaky test',
			repository: repoId,
			agent: 'claude',
			model: 'haiku',
			title: 'Flaky test'
		});
		expect(started).toMatchObject({ parentId: null, status: 'running', title: 'Flaky test' });
		expect(workspaces.get(started.id)).toMatchObject({
			repoId,
			startedBy: actor,
			settings: { model: 'haiku' }
		});
		expect(workspaces.get(started.id).transcript[0]).toMatchObject({ senderName: 'Desktop' });
		expect((await call('list_agents')).map((agent: { id: string }) => agent.id)).toEqual([
			started.id
		]);

		await call('send_message', {
			workspace_id: started.id,
			message: 'Also the docs',
			interrupt: true
		});
		expect(workspaces.get(started.id).transcript.at(-1)).toMatchObject({ text: 'Also the docs' });
		await call('stop_agent', { workspace_id: started.id });
		workspaces.record(started.id, { kind: 'turn.failed', error: 'Stopped' });
		expect(await call('archive_agent', { workspace_id: started.id })).toEqual({
			archived: started.id
		});
		expect(archived).toEqual([started.id]);
	});
});

it('requires a fresh token for an older client, for one repository or all of them', () => {
	const { store, workspaces, caller } = setup();
	for (const repoId of [workspaces.get(caller).repoId, undefined]) {
		const id = `external:old-${repoId}`;
		const token = id + '.test';
		store.append({
			type: 'access.granted',
			stream: `access:${id}`,
			data: {
				id,
				name: 'Old client',
				...(repoId && { repoId }),
				digest: createHash('sha256').update(token).digest('hex')
			}
		});
		expect(workspaces.agents.authenticate(token)).toBeNull();
	}
	expect(workspaces.access.list()).toEqual([]);
});

it('issues tokens only for repositories that exist', () => {
	const { workspaces, caller } = setup();
	expect(() => workspaces.access.issue('None', [])).toThrow(
		expect.objectContaining({ status: 400 })
	);
	expect(() => workspaces.access.issue('Unknown', ['made-up'])).toThrow();
	const repoId = workspaces.get(caller).repoId!;
	workspaces.access.issue('Twice', [repoId, repoId]);
	expect(workspaces.access.list()).toEqual([
		expect.objectContaining({ name: 'Twice', repoIds: [repoId] })
	]);
});

it('keeps the agents an external client started to its repositories', async () => {
	const { repos, workspaces, agents, callAs, caller } = setup();
	const repoId = repos.register(gitRepository()).id;
	const actor = agents.authenticate(workspaces.access.issue('Desktop', [repoId]))!;
	const started = await callAs(actor)('start_agent', { prompt: 'Look around', repository: repoId });
	const child = callAs(started.id);
	expect(
		(await child('start_agent', { prompt: 'Build', repository: workspaces.get(caller).repoId }))
			.error
	).toMatch(/access to/);
	expect((await child('send_message', { workspace_id: caller, message: 'Hi' })).error).toMatch(
		/not found/
	);
	expect(JSON.stringify(await child('list_workspaces'))).not.toContain(caller);
	expect((await child('read_workspace', { workspace_id: caller })).error).toMatch(/not found/);
	expect(await child('read_workspace', { workspace_id: started.id })).not.toHaveProperty('error');
});

it('forgets a removed repository for good, though its ID is used again', () => {
	const { repos, workspaces, agents } = setup();
	const path = gitRepository();
	const repoId = repos.register(path).id;
	const actor = agents.authenticate(workspaces.access.issue('Desktop', [repoId]))!;
	repos.remove(repoId);
	expect(repos.register(path).id).toBe(repoId);
	expect(workspaces.access.reaches(actor, repoId)).toBe(false);
});
