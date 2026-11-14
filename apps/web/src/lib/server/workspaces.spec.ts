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
