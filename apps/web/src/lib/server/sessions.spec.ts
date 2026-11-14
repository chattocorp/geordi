import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRepos } from './repos.ts';
import { createSessions } from './sessions.ts';

function setup({ connected = true } = {}) {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);

	const store = new EventStore<GeordiEvent>(':memory:');
	const repos = createRepos(store);
	const sent: ForgeMessage[] = [];
	const sessions = createSessions(store, repos, (message) => (sent.push(message), connected));
	const repo = repos.register(repoPath);
	return { store, repos, sessions, sent, repo };
}

describe('sessions', () => {
	it('starts a turn on creation and records daemon output', () => {
		const { sessions, sent, repo } = setup();
		const id = sessions.create({ repoId: repo.id, agent: 'claude', prompt: 'Fix the bug\nplease' });

		expect(sent).toEqual([
			{
				type: 'turn.start',
				sessionId: id,
				agent: 'claude',
				repoPath: repo.path,
				resumeId: null,
				prompt: 'Fix the bug\nplease'
			}
		]);
		expect(sessions.get(id)).toMatchObject({ title: 'Fix the bug', status: 'running' });

		sessions.record(id, { kind: 'worktree', path: '/wt', branch: 'geordi/x' });
		sessions.record(id, { kind: 'resume', id: 'cli-session' });
		sessions.record(id, { kind: 'tool', id: 't1', name: 'Read', input: '{}' });
		sessions.record(id, { kind: 'tool.result', id: 't1', output: 'contents', isError: false });
		sessions.record(id, { kind: 'text', text: 'Done.' });
		sessions.record(id, { kind: 'turn.completed' });

		const session = sessions.get(id);
		expect(session).toMatchObject({
			status: 'idle',
			worktree: { path: '/wt', branch: 'geordi/x' },
			resumeId: 'cli-session'
		});
		expect(session.transcript.map((item) => item.kind)).toEqual(['user', 'tool', 'text']);
		expect(session.transcript[1]).toMatchObject({ output: 'contents', isError: false });
	});

	it('resumes the CLI session on follow-up messages', () => {
		const { sessions, sent, repo } = setup();
		const id = sessions.create({ repoId: repo.id, agent: 'codex', prompt: 'One' });
		sessions.record(id, { kind: 'resume', id: 'thread-1' });
		sessions.record(id, { kind: 'turn.completed' });

		sessions.send(id, 'Two');
		expect(sent[1]).toMatchObject({ type: 'turn.start', resumeId: 'thread-1', prompt: 'Two' });
	});

	it('rejects messages while a turn is running', () => {
		const { sessions, repo } = setup();
		const id = sessions.create({ repoId: repo.id, agent: 'claude', prompt: 'One' });
		expect(() => sessions.send(id, 'Two')).toThrow();
	});

	it('fails the turn when no daemon is connected', () => {
		const { sessions, repo } = setup({ connected: false });
		const id = sessions.create({ repoId: repo.id, agent: 'claude', prompt: 'One' });
		expect(sessions.get(id)).toMatchObject({ status: 'idle' });
		expect(sessions.get(id).transcript.at(-1)).toMatchObject({
			kind: 'error',
			error: 'No daemon connected'
		});
	});

	it('fails turns a reconnecting daemon no longer knows about', () => {
		const { sessions, repo } = setup();
		const lost = sessions.create({ repoId: repo.id, agent: 'claude', prompt: 'One' });
		const alive = sessions.create({ repoId: repo.id, agent: 'claude', prompt: 'Two' });

		sessions.reconcile([alive]);
		expect(sessions.get(lost).status).toBe('idle');
		expect(sessions.get(alive).status).toBe('running');
	});

	it('lists sessions per repository without transcripts', () => {
		const { sessions, repo } = setup();
		sessions.create({ repoId: repo.id, agent: 'claude', prompt: 'One' });
		const [summary] = sessions.list(repo.id);
		expect(summary).not.toHaveProperty('transcript');
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
