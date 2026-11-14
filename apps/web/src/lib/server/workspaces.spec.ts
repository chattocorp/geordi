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

	/** Creates a workspace; returns its ID and the ID of its first session. */
	const create = (prompt: string, agent: 'claude' | 'codex' = 'claude') => {
		const id = workspaces.create({ repoId: repo.id, agent, prompt });
		return { id, sessionId: workspaces.get(id).sessions[0].id };
	};
	return { store, repos, workspaces, sent, repo, create, dispatch };
}

describe('workspaces', () => {
	it('starts a turn on creation and records daemon output', () => {
		const { workspaces, sent, repo, create } = setup();
		const { id, sessionId } = create('Fix the bug\nplease');

		expect(sent).toEqual([
			{
				type: 'turn.start',
				sessionId,
				workspaceId: id,
				agent: 'claude',
				repoPath: repo.path,
				apiToken: expect.any(String),
				resumeId: null,
				prompt: 'Fix the bug\nplease'
			}
		]);
		expect(workspaces.get(id)).toMatchObject({
			title: 'Fix the bug',
			sessions: [{ title: 'Fix the bug', status: 'running' }]
		});

		workspaces.record(sessionId, { kind: 'worktree', path: '/wt', branch: 'geordi/x' });
		workspaces.record(sessionId, { kind: 'resume', id: 'cli-session' });
		workspaces.record(sessionId, { kind: 'tool', id: 't1', name: 'Read', input: '{}' });
		workspaces.record(sessionId, {
			kind: 'tool.result',
			id: 't1',
			output: 'contents',
			isError: false
		});
		workspaces.record(sessionId, { kind: 'text', text: 'Done.' });
		workspaces.record(sessionId, { kind: 'turn.completed' });

		const workspace = workspaces.get(id);
		expect(workspace.worktree).toEqual({ path: '/wt', branch: 'geordi/x' });
		const [session] = workspace.sessions;
		expect(session).toMatchObject({ status: 'idle', resumeId: 'cli-session' });
		expect(session.transcript.map((item) => item.kind)).toEqual(['user', 'tool', 'text']);
		expect(session.transcript[1]).toMatchObject({ output: 'contents', isError: false });
	});

	it('runs several sessions in one workspace', () => {
		const { workspaces, sent, create } = setup();
		const { id, sessionId } = create('One');
		const second = workspaces.addSession(id, { agent: 'codex', prompt: 'Two' });

		expect(sent[1]).toMatchObject({ sessionId: second, workspaceId: id, agent: 'codex' });
		expect(workspaces.get(id).sessions.map((session) => session.id)).toEqual([sessionId, second]);
		expect(workspaces.list(workspaces.get(id).repoId)[0]).toMatchObject({
			status: 'running',
			agents: ['claude', 'codex']
		});
	});

	it('resumes the CLI session on follow-up messages', () => {
		const { workspaces, sent, create } = setup();
		const { sessionId } = create('One', 'codex');
		workspaces.record(sessionId, { kind: 'resume', id: 'thread-1' });
		workspaces.record(sessionId, { kind: 'turn.completed' });

		workspaces.send(sessionId, 'Two');
		expect(sent[1]).toMatchObject({ type: 'turn.start', resumeId: 'thread-1', prompt: 'Two' });
	});

	it('rejects messages while a turn is running', () => {
		const { workspaces, create } = setup();
		const { sessionId } = create('One');
		expect(() => workspaces.send(sessionId, 'Two')).toThrow();
	});

	it('fails the turn when no daemon is connected', () => {
		const { workspaces, create } = setup({ connected: false });
		const [session] = workspaces.get(create('One').id).sessions;
		expect(session.status).toBe('idle');
		expect(session.transcript.at(-1)).toMatchObject({
			kind: 'error',
			error: 'No daemon connected'
		});
	});

	it('fails turns a reconnecting daemon no longer knows about', () => {
		const { workspaces, repo, create } = setup();
		const lost = create('One');
		const alive = create('Two');

		workspaces.reconcile([alive.sessionId]);
		expect(workspaces.list(repo.id).map((workspace) => [workspace.id, workspace.status])).toEqual([
			[alive.id, 'running'],
			[lost.id, 'idle']
		]);
	});

	it('lists workspaces per repository without their sessions', () => {
		const { workspaces, repo, create } = setup();
		create('One');
		const [summary] = workspaces.list(repo.id);
		expect(summary).not.toHaveProperty('sessions');
	});

	it('turns sessions from before workspaces into workspaces of their own', () => {
		const { store, repos, workspaces, repo, sent, dispatch } = setup();
		store.append({
			type: 'session.created',
			stream: 'session:old',
			data: { id: 'old', repoId: repo.id, agent: 'claude', title: 'Legacy' }
		});

		expect(workspaces.get('old')).toMatchObject({
			repoId: repo.id,
			title: 'Legacy',
			sessions: [{ id: 'old', workspaceId: 'old' }]
		});
		// the worktree keeps its name: it was derived from the session ID
		workspaces.send('old', 'Continue');
		expect(sent[0]).toMatchObject({ sessionId: 'old', workspaceId: 'old' });

		// and it survives a replay
		expect(createWorkspaces(store, repos, dispatch).get('old').sessions).toHaveLength(1);
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

describe('agents starting agents', () => {
	/** Matches the error a refused request throws, by its message. */
	const refusal = (message: RegExp) =>
		expect.objectContaining({
			body: expect.objectContaining({ message: expect.stringMatching(message) })
		});

	const worktree = { kind: 'worktree', path: '/wt', branch: 'geordi/parent' } as const;

	function lead(options?: Parameters<typeof setup>[0]) {
		const context = setup(options);
		const { id, sessionId } = context.create('Lead');
		context.workspaces.record(sessionId, worktree);
		return { ...context, id, lead: sessionId, agents: context.workspaces.agents };
	}

	const tokenOf = (message: ForgeMessage | undefined) =>
		(message as Extract<ForgeMessage, { type: 'turn.start' }>).apiToken;

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
		const id = before.create({ repoId: repo.id, agent: 'claude', prompt: 'Lead' });
		const caller = before.get(id).sessions[0].id;

		const restarted = createWorkspaces(store, repos, dispatch, options);
		expect(restarted.agents.authenticate(tokenOf(sent.at(-1)))).toBe(caller);
		const stranger = createWorkspaces(store, repos, dispatch, { secret: 'another' });
		expect(stranger.agents.authenticate(tokenOf(sent.at(-1)))).toBeNull();
	});

	it('starts a child in the same workspace', () => {
		const { workspaces, agents, sent, id, lead: caller } = lead();
		const child = agents.start(caller, { worktree: 'shared', prompt: 'Review this' });

		expect(child).toMatchObject({ workspaceId: id, parentSessionId: caller, agent: 'claude' });
		expect(workspaces.get(id).sessions.map((session) => session.id)).toEqual([
			caller,
			child.sessionId
		]);
		expect(sent.at(-1)).toMatchObject({ sessionId: child.sessionId, workspaceId: id });
		expect(sent.at(-1)).not.toHaveProperty('base');
	});

	it('starts a child in a sub-workspace branched from its own', () => {
		const { workspaces, agents, sent, repo, id, lead: caller } = lead();
		const child = agents.start(caller, { worktree: 'own', agent: 'codex', prompt: 'Build it' });

		expect(child.workspaceId).not.toBe(id);
		expect(workspaces.get(child.workspaceId)).toMatchObject({
			repoId: repo.id,
			parentSessionId: caller,
			parentWorkspaceId: id,
			base: 'geordi/parent'
		});
		expect(sent.at(-1)).toMatchObject({
			type: 'turn.start',
			agent: 'codex',
			workspaceId: child.workspaceId,
			base: 'geordi/parent'
		});
		expect(workspaces.ref(child.workspaceId).base).toBe('geordi/parent');
	});

	it('reports what a child said in its latest turn', async () => {
		const { workspaces, agents, lead: caller } = lead();
		const { sessionId } = agents.start(caller, { worktree: 'shared', prompt: 'Go' });
		workspaces.record(sessionId, { kind: 'text', text: 'Looking.' });

		const waiting = agents.wait(caller, sessionId, 5000);
		workspaces.record(sessionId, { kind: 'text', text: 'Done.' });
		workspaces.record(sessionId, { kind: 'turn.completed' });
		expect(await waiting).toMatchObject({
			status: 'idle',
			reply: 'Looking.\n\nDone.',
			error: null
		});

		agents.send(caller, sessionId, 'More');
		workspaces.record(sessionId, { kind: 'turn.failed', error: 'boom' });
		expect(agents.get(caller, sessionId)).toMatchObject({ reply: '', error: 'boom' });
	});

	it('gives up waiting after the timeout', async () => {
		const { agents, lead: caller } = lead();
		const { sessionId } = agents.start(caller, { worktree: 'shared', prompt: 'Go' });
		expect(await agents.wait(caller, sessionId, 10)).toMatchObject({ status: 'running' });
	});

	it('only lets an agent control the agents it started', () => {
		const { agents, create, lead: caller } = lead();
		const stranger = create('Unrelated').sessionId;
		const child = agents.start(caller, { worktree: 'shared', prompt: 'Go' }).sessionId;
		const grandchild = agents.start(child, { worktree: 'shared', prompt: 'Deeper' }).sessionId;

		expect(agents.list(caller).map((agent) => agent.sessionId)).toEqual([child, grandchild]);
		expect(() => agents.get(caller, stranger)).toThrow();
		expect(() => agents.stop(child, caller)).toThrow();
		expect(() => agents.get(grandchild, child)).toThrow();
	});

	it('limits nesting depth and concurrent children', () => {
		const { agents, lead: caller } = lead();
		const limited = createWorkspacesWith({ depth: 1, children: 2 });

		// defaults: 3 deep
		const one = agents.start(caller, { worktree: 'shared', prompt: '1' }).sessionId;
		const two = agents.start(one, { worktree: 'shared', prompt: '2' }).sessionId;
		const three = agents.start(two, { worktree: 'shared', prompt: '3' }).sessionId;
		expect(() => agents.start(three, { worktree: 'shared', prompt: '4' })).toThrow(
			refusal(/nested/)
		);

		const first = limited.agents.start(limited.caller, { worktree: 'shared', prompt: 'a' });
		limited.agents.start(limited.caller, { worktree: 'shared', prompt: 'b' });
		const start = () => limited.agents.start(limited.caller, { worktree: 'shared', prompt: 'c' });
		expect(start).toThrow(refusal(/2 agents are already running/));

		// a finished agent frees a slot, and waking it up again takes one
		limited.workspaces.record(first.sessionId, { kind: 'turn.completed' });
		const third = start();
		expect(() => limited.agents.send(limited.caller, first.sessionId, 'Again')).toThrow(
			refusal(/already running/)
		);
		limited.workspaces.record(third.sessionId, { kind: 'turn.completed' });
		limited.agents.send(limited.caller, first.sessionId, 'Again');
		expect(() =>
			limited.agents.start(first.sessionId, { worktree: 'shared', prompt: 'd' })
		).toThrow(refusal(/nested/));
	});

	function createWorkspacesWith(limits: { depth: number; children: number }) {
		const { store, repos, repo, dispatch } = setup();
		const workspaces = createWorkspaces(store, repos, dispatch, { limits });
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Lead' });
		return { workspaces, agents: workspaces.agents, caller: workspaces.get(id).sessions[0].id };
	}
});
