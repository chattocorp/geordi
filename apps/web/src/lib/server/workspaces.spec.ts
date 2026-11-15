import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRepos } from './repos.ts';
import { createWorkspaces } from './workspaces.ts';

function setup({ connected = true } = {}) {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);

	const store = new EventStore<GeordiEvent>(':memory:');
	const repos = createRepos(store);
	const sent: ForgeMessage[] = [];
	const dispatch = (message: ForgeMessage) => (sent.push(message), connected);
	const workspaces = createWorkspaces(store, repos, dispatch);
	const repo = repos.register(repoPath);
	const create = (prompt: string, agent: 'claude' | 'codex' = 'claude') =>
		workspaces.create({ repoId: repo.id, agent, prompt });
	return { store, repos, workspaces, sent, repo, create, dispatch };
}

const tokenOf = (message: ForgeMessage | undefined) =>
	(message as Extract<ForgeMessage, { type: 'turn.start' }>).apiToken;

describe('workspaces', () => {
	it('starts a turn on creation and records daemon output', () => {
		const { workspaces, sent, repo, create } = setup();
		const id = create('Fix the bug\nplease');

		expect(sent).toEqual([
			{
				type: 'turn.start',
				workspaceId: id,
				worktreeId: id,
				agent: 'claude',
				repoPath: repo.path,
				apiToken: expect.any(String),
				resumeId: null,
				prompt: 'Fix the bug\nplease'
			}
		]);
		expect(workspaces.get(id)).toMatchObject({
			title: 'Fix the bug',
			status: 'running',
			parentId: null,
			worktreeId: id
		});

		workspaces.record(id, { kind: 'worktree', path: '/wt', branch: 'geordi/x' });
		workspaces.record(id, { kind: 'resume', id: 'cli-session' });
		workspaces.record(id, { kind: 'tool', id: 't1', name: 'Read', input: '{}' });
		workspaces.record(id, { kind: 'tool.result', id: 't1', output: 'contents', isError: false });
		workspaces.record(id, { kind: 'text', text: 'Done.' });
		workspaces.record(id, { kind: 'turn.completed' });

		const workspace = workspaces.get(id);
		expect(workspace).toMatchObject({
			status: 'idle',
			resumeId: 'cli-session',
			worktree: { path: '/wt', branch: 'geordi/x' }
		});
		expect(workspace.transcript.map((item) => item.kind)).toEqual(['user', 'tool', 'text']);
		expect(workspace.transcript[1]).toMatchObject({ output: 'contents', isError: false });
	});

	it('resumes the CLI session on follow-up messages', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One', 'codex');
		workspaces.record(id, { kind: 'resume', id: 'thread-1' });
		workspaces.record(id, { kind: 'turn.completed' });

		workspaces.send(id, 'Two');
		expect(sent[1]).toMatchObject({ type: 'turn.start', resumeId: 'thread-1', prompt: 'Two' });
	});

	it('queues messages sent while the agent works, and sends them one turn at a time', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.send(id, 'Three');
		expect(sent).toHaveLength(1);
		expect(workspaces.get(id)).toMatchObject({ status: 'running', queue: ['Two', 'Three'] });

		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ type: 'turn.start', prompt: 'Two' });
		expect(workspaces.get(id)).toMatchObject({ status: 'running', queue: ['Three'] });

		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ prompt: 'Three' });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(workspaces.get(id)).toMatchObject({ status: 'idle', queue: [] });
		expect(sent).toHaveLength(3);
		expect(
			workspaces.get(id).transcript.flatMap((item) => (item.kind === 'user' ? [item.text] : []))
		).toEqual(['One', 'Two', 'Three']);
	});

	it('lets a waiting message be taken back', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.send(id, 'Three');
		workspaces.dequeue(id, 0);
		workspaces.dequeue(id, 7);
		expect(workspaces.get(id).queue).toEqual(['Three']);

		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ prompt: 'Three' });
	});

	it('holds waiting messages after a failed turn, until the user says something', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.record(id, { kind: 'turn.failed', error: 'Stopped' });
		expect(sent).toHaveLength(1);
		expect(workspaces.get(id)).toMatchObject({ status: 'idle', queue: ['Two'] });

		// what was waiting goes first, in order
		workspaces.send(id, 'Three');
		expect(sent.at(-1)).toMatchObject({ prompt: 'Two' });
		expect(workspaces.get(id).queue).toEqual(['Three']);
	});

	it('steers a working agent: stops its turn and sends the message as soon as it has', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Later');
		workspaces.steer(id, 'Not that, this');
		workspaces.steer(id, 'And this');
		expect(sent.at(-1)).toEqual({ type: 'turn.stop', workspaceId: id });
		expect(workspaces.get(id)).toMatchObject({ steering: ['Not that, this', 'And this'] });

		// the daemon reports the turn as stopped: the steering goes out, ahead of the queue
		workspaces.record(id, { kind: 'turn.failed', error: 'Stopped' });
		expect(sent.at(-1)).toMatchObject({
			type: 'turn.start',
			prompt: 'Not that, this\n\nAnd this'
		});
		const workspace = workspaces.get(id);
		expect(workspace).toMatchObject({ status: 'running', steering: [], queue: ['Later'] });
		// being stopped for this is not shown as a failure
		expect(workspace.transcript.map((item) => item.kind)).toEqual(['user', 'user']);

		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ prompt: 'Later' });
	});

	it('steering an idle agent is just saying something', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.steer(id, 'Two');
		expect(sent.at(-1)).toMatchObject({ type: 'turn.start', prompt: 'Two' });
		expect(workspaces.get(id).steering).toEqual([]);
	});

	it('still sends the steering if the turn finished on its own first', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.steer(id, 'Two');
		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ type: 'turn.start', prompt: 'Two' });
	});

	it('keeps the queue across a restart', () => {
		const { store, repos, workspaces, dispatch, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		expect(createWorkspaces(store, repos, dispatch).get(id).queue).toEqual(['Two']);
	});

	it('fails the turn when no daemon is connected', () => {
		const { workspaces, create } = setup({ connected: false });
		const workspace = workspaces.get(create('One'));
		expect(workspace.status).toBe('idle');
		expect(workspace.transcript.at(-1)).toMatchObject({
			kind: 'error',
			error: 'No daemon connected'
		});
	});

	it('fails turns a reconnecting daemon no longer knows about', () => {
		const { workspaces, repo, create } = setup();
		const lost = create('One');
		const alive = create('Two');

		workspaces.reconcile([alive]);
		expect(workspaces.list(repo.id).map((workspace) => [workspace.id, workspace.status])).toEqual([
			[alive, 'running'],
			[lost, 'idle']
		]);
	});

	it('lists workspaces per repository without their transcripts', () => {
		const { workspaces, repo, create } = setup();
		create('One');
		const [summary] = workspaces.list(repo.id);
		expect(summary).not.toHaveProperty('transcript');
	});
});

describe('archiving', () => {
	it('takes a workspace out of the lists and keeps its conversation', () => {
		const { store, repos, workspaces, repo, create, dispatch } = setup();
		const id = create('One');
		expect(() => workspaces.archive(id)).toThrow(); // the agent is working

		workspaces.record(id, { kind: 'text', text: 'Done.' });
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.archive(id);
		workspaces.archive(id);

		expect(workspaces.list(repo.id)).toEqual([]);
		expect(workspaces.all()).toEqual([]);
		expect(workspaces.get(id)).toMatchObject({
			archivedAt: expect.any(String),
			transcript: [{ kind: 'user' }, { kind: 'text', text: 'Done.' }]
		});
		expect(() => workspaces.send(id, 'More')).toThrow();
		expect(createWorkspaces(store, repos, dispatch).get(id).archivedAt).not.toBeNull();
	});

	it('knows whether a worktree is still in use by another workspace', () => {
		const { workspaces, create } = setup();
		const lead = create('Lead');
		workspaces.record(lead, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = workspaces.agents.start(lead, { worktree: 'shared', prompt: 'Review' }).id;
		const own = workspaces.agents.start(lead, { worktree: 'own', prompt: 'Build' }).id;

		expect(workspaces.worktreeInUse(lead)).toBe(true);
		expect(workspaces.worktreeInUse(child)).toBe(true);
		expect(workspaces.worktreeInUse(own)).toBe(false);

		workspaces.record(child, { kind: 'turn.completed' });
		workspaces.archive(child);
		expect(workspaces.worktreeInUse(lead)).toBe(false);
	});
});

describe('event logs from before a workspace had one conversation', () => {
	it('turns a session without a workspace into a workspace', () => {
		const { store, workspaces, repo, sent } = setup();
		store.append({
			type: 'session.created',
			stream: 'session:old',
			data: { id: 'old', repoId: repo.id, agent: 'claude', title: 'Legacy' }
		});
		store.append({
			type: 'session.output',
			stream: 'session:old',
			data: { id: 'old', event: { kind: 'text', text: 'Hello' } }
		});

		expect(workspaces.get('old')).toMatchObject({
			repoId: repo.id,
			title: 'Legacy',
			agent: 'claude',
			worktreeId: 'old',
			transcript: [{ kind: 'text', text: 'Hello' }]
		});
		// the worktree keeps its name: it was derived from the session ID
		workspaces.send('old', 'Continue');
		expect(sent[0]).toMatchObject({ workspaceId: 'old', worktreeId: 'old' });
	});

	it('makes the first session of a workspace its conversation, and further ones workspaces sharing its worktree', () => {
		const { store, repos, workspaces, repo, dispatch } = setup();
		// a workspace as it used to be recorded: created without an agent, then its sessions
		store.append({
			type: 'workspace.created',
			stream: 'workspace:w',
			data: { id: 'w', repoId: repo.id, title: 'Build it' } as never
		});
		const session = (id: string, agent: 'claude' | 'codex', parentSessionId?: string) =>
			store.append({
				type: 'session.created',
				stream: `session:${id}`,
				data: { id, workspaceId: 'w', agent, title: `Session ${id}`, parentSessionId }
			});
		const output = (id: string, event: Parameters<typeof workspaces.record>[1]) =>
			store.append({ type: 'session.output', stream: `session:${id}`, data: { id, event } });

		session('s1', 'claude');
		store.append({ type: 'session.message', stream: 'session:s1', data: { id: 's1', text: 'Go' } });
		output('s1', { kind: 'worktree', path: '/wt', branch: 'geordi/w' });
		session('s2', 'codex', 's1');
		output('s2', { kind: 'text', text: 'Reviewed.' });

		const check = (all: typeof workspaces) => {
			expect(all.get('w')).toMatchObject({
				title: 'Build it',
				agent: 'claude',
				status: 'running',
				worktreeId: 'w',
				transcript: [{ kind: 'user', text: 'Go' }]
			});
			expect(all.get('s2')).toMatchObject({
				title: 'Session s2',
				agent: 'codex',
				parentId: 'w',
				worktreeId: 'w',
				worktree: { path: '/wt', branch: 'geordi/w' },
				transcript: [{ kind: 'text', text: 'Reviewed.' }]
			});
			expect(all.list(repo.id)).toHaveLength(2);
		};
		check(workspaces);
		// and it survives a replay
		check(createWorkspaces(store, repos, dispatch));
	});
});

describe('agents starting agents', () => {
	/** Matches the error a refused request throws, by its message. */
	const refusal = (message: RegExp) =>
		expect.objectContaining({
			body: expect.objectContaining({ message: expect.stringMatching(message) })
		});

	const worktree = { kind: 'worktree', path: '/wt', branch: 'geordi/parent' } as const;

	function lead(options?: Parameters<typeof setup>[0]) {
		const context = setup(options);
		const id = context.create('Lead');
		context.workspaces.record(id, worktree);
		return { ...context, lead: id, agents: context.workspaces.agents };
	}

	it('identifies an agent by the token of its running turn only', () => {
		const { workspaces, agents, sent, lead: caller } = lead();
		const first = tokenOf(sent[0]);

		expect(agents.authenticate(first)).toBe(caller);
		expect(agents.authenticate('made-up')).toBeNull();
		expect(agents.authenticate(`${caller}.1.forged`)).toBeNull();
		workspaces.record(caller, { kind: 'turn.completed' });
		expect(agents.authenticate(first)).toBeNull();

		// the next turn has a token of its own; the old one stays dead
		workspaces.send(caller, 'More');
		expect(agents.authenticate(tokenOf(sent.at(-1)))).toBe(caller);
		expect(agents.authenticate(first)).toBeNull();
	});

	it('keeps tokens valid across a restart, given the same secret', () => {
		const { store, repos, repo, dispatch, sent } = setup();
		const options = { secret: 'the-secret' };
		const before = createWorkspaces(store, repos, dispatch, options);
		const caller = before.create({ repoId: repo.id, agent: 'claude', prompt: 'Lead' });

		const restarted = createWorkspaces(store, repos, dispatch, options);
		expect(restarted.agents.authenticate(tokenOf(sent.at(-1)))).toBe(caller);
		const stranger = createWorkspaces(store, repos, dispatch, { secret: 'another' });
		expect(stranger.agents.authenticate(tokenOf(sent.at(-1)))).toBeNull();
	});

	it('starts a child that works in its own worktree, branched from the parent', () => {
		const { workspaces, agents, sent, repo, lead: caller } = lead();
		const child = agents.start(caller, { worktree: 'own', agent: 'codex', prompt: 'Build it' });

		expect(child).toMatchObject({ parentId: caller, agent: 'codex', sharesWorktree: false });
		expect(workspaces.get(child.id)).toMatchObject({
			repoId: repo.id,
			parentId: caller,
			worktreeId: child.id,
			base: 'geordi/parent',
			worktree: null
		});
		expect(sent.at(-1)).toMatchObject({
			type: 'turn.start',
			workspaceId: child.id,
			worktreeId: child.id,
			base: 'geordi/parent'
		});
	});

	it('starts a child that works in the parent’s worktree', () => {
		const { workspaces, agents, sent, lead: caller } = lead();
		const child = agents.start(caller, { worktree: 'shared', prompt: 'Review this' });

		expect(child).toMatchObject({
			parentId: caller,
			agent: 'claude',
			sharesWorktree: true,
			branch: 'geordi/parent'
		});
		// a workspace of its own, with its own conversation, in the same directory
		expect(workspaces.get(child.id)).toMatchObject({
			worktreeId: caller,
			worktree: { path: '/wt', branch: 'geordi/parent' },
			transcript: [{ kind: 'user', text: 'Review this' }]
		});
		expect(sent.at(-1)).toMatchObject({ workspaceId: child.id, worktreeId: caller });
		expect(sent.at(-1)).not.toHaveProperty('base');
		expect(workspaces.ref(child.id)).toEqual(workspaces.ref(caller));
	});

	it('reports what a child said in its latest turn', async () => {
		const { workspaces, agents, lead: caller } = lead();
		const { id } = agents.start(caller, { worktree: 'shared', prompt: 'Go' });
		workspaces.record(id, { kind: 'text', text: 'Looking.' });

		const waiting = agents.wait(caller, id, 5000);
		workspaces.record(id, { kind: 'text', text: 'Done.' });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(await waiting).toMatchObject({
			status: 'idle',
			reply: 'Looking.\n\nDone.',
			error: null
		});

		agents.send(caller, id, 'More');
		workspaces.record(id, { kind: 'turn.failed', error: 'boom' });
		expect(agents.get(caller, id)).toMatchObject({ reply: '', error: 'boom' });
	});

	it('gives up waiting after the timeout', async () => {
		const { agents, lead: caller } = lead();
		const { id } = agents.start(caller, { worktree: 'shared', prompt: 'Go' });
		expect(await agents.wait(caller, id, 10)).toMatchObject({ status: 'running' });
	});

	it('only lets an agent control the agents it started', () => {
		const { agents, create, lead: caller } = lead();
		const stranger = create('Unrelated');
		const child = agents.start(caller, { worktree: 'shared', prompt: 'Go' }).id;
		const grandchild = agents.start(child, { worktree: 'shared', prompt: 'Deeper' }).id;

		expect(agents.list(caller).map((agent) => agent.id)).toEqual([child, grandchild]);
		expect(() => agents.get(caller, stranger)).toThrow();
		expect(() => agents.stop(child, caller)).toThrow();
		expect(() => agents.get(grandchild, child)).toThrow();
	});

	it('limits nesting depth and concurrent children', () => {
		const { agents, lead: caller } = lead();
		const shared = (prompt: string) => ({ worktree: 'shared', prompt }) as const;

		// defaults: 3 deep
		const one = agents.start(caller, shared('1')).id;
		const two = agents.start(one, shared('2')).id;
		const three = agents.start(two, shared('3')).id;
		expect(() => agents.start(three, shared('4'))).toThrow(refusal(/nested/));

		const limited = lead();
		const strict = createWorkspaces(limited.store, limited.repos, limited.dispatch, {
			limits: { depth: 1, children: 2 }
		});
		const first = strict.agents.start(limited.lead, shared('a'));
		strict.agents.start(limited.lead, shared('b'));
		const start = () => strict.agents.start(limited.lead, shared('c'));
		expect(start).toThrow(refusal(/2 agents are already running/));

		// a finished agent frees a slot, and waking it up again takes one
		strict.record(first.id, { kind: 'turn.completed' });
		const third = start();
		expect(() => strict.agents.send(limited.lead, first.id, 'Again')).toThrow(
			refusal(/already running/)
		);
		strict.record(third.id, { kind: 'turn.completed' });
		strict.agents.send(limited.lead, first.id, 'Again');
		expect(() => strict.agents.start(first.id, shared('d'))).toThrow(refusal(/nested/));
	});
});

describe('repos', () => {
	it('registers a repository once and rejects non-repositories', () => {
		const { repos, repo } = setup();
		expect(repos.register(repo.path)).toEqual(repo);
		expect(repos.list()).toHaveLength(1);
		expect(() => repos.register(tmpdir())).toThrow();
	});
});
