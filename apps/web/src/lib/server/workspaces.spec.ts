import { createImages } from './images.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AgentEvent, ForgeMessage } from '@geordi/protocol';
import { describe, expect, it, vi } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRepos } from './repos.ts';
import { createWorkspaces } from './workspaces.ts';

function setup({ connected = true, database = ':memory:' } = {}) {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);

	const store = new EventStore<GeordiEvent>(database);
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
	(message as Extract<ForgeMessage, { type: 'agent.message' }>).apiToken;

describe('workspaces', () => {
	it('publishes nested reviewer edits without changing earlier snapshots', () => {
		const { workspaces, create } = setup();
		const id = create('Review');
		const follower = workspaces.followTranscript(id);
		expect(follower.read()).toMatchObject([{ kind: 'user' }]);
		const path = ['lead', 'reviewer'];
		workspaces.record(id, { kind: 'subagent', path, update: { kind: 'info', state: 'running' } });
		const first = follower.read();
		workspaces.record(id, { kind: 'subagent', path, update: { kind: 'info', state: 'done' } });
		expect(first).toMatchObject({
			edits: [[1, 0, { id: 'lead', items: [{ id: 'reviewer', state: 'running' }] }]]
		});
		expect(follower.read()).toMatchObject({
			edits: [[1, 1, { id: 'lead', items: [{ id: 'reviewer', state: 'done' }] }]]
		});
		follower.close();
	});

	it('keeps parallel and nested ACP sessions on their original turn across replay', () => {
		const { workspaces, create, store, repos, dispatch } = setup();
		const id = create('Review the changes');
		for (const path of [['daemon'], ['ui'], ['ui', 'design']]) {
			workspaces.record(id, {
				kind: 'subagent',
				path,
				update: { kind: 'info', state: 'running', title: path.at(-1) }
			});
			workspaces.record(id, {
				kind: 'subagent',
				path,
				update: { kind: 'tool', id: 'same', name: 'Read' }
			});
		}
		workspaces.record(id, { kind: 'turn.completed' });
		const next = createWorkspaces(store, repos, dispatch);
		for (const path of [['ui', 'design'], ['ui'], ['daemon']]) {
			next.record(id, {
				kind: 'subagent',
				path,
				update: { kind: 'tool', id: 'same', output: path.join('/') }
			});
			next.record(id, { kind: 'subagent', path, update: { kind: 'info', state: 'done' } });
		}
		next.send(id, 'Continue');
		next.record(id, {
			kind: 'subagent',
			path: ['daemon'],
			update: { kind: 'message', id: 'report', text: 'Finished.', incoming: false }
		});
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.get(id).transcript).toMatchObject([
			{ kind: 'user' },
			{ title: 'daemon', state: 'done', items: [{ output: 'daemon' }, { text: 'Finished.' }] },
			{
				title: 'ui',
				state: 'done',
				items: [{ output: 'ui' }, { title: 'design', items: [{ output: 'ui/design' }] }]
			},
			{ kind: 'user' }
		]);
	});

	it('updates a plan in place and restores each plan when the forge restarts', () => {
		const { workspaces, create, store, repos, dispatch } = setup();
		const id = create('Plan the change');
		const written = {
			kind: 'plan',
			id: 'review',
			plan: { type: 'markdown', content: 'Draft' }
		} as const;
		workspaces.record(id, written);
		workspaces.record(id, { kind: 'text', text: 'Checking the details.' });
		const checklist = {
			kind: 'plan',
			id: 'tasks',
			plan: { type: 'items', entries: [{ content: 'Check', status: 'in_progress' }] }
		} satisfies AgentEvent;
		workspaces.record(id, checklist);
		const restarted = createWorkspaces(store, repos, dispatch);
		const revised = { ...written, plan: { ...written.plan, content: 'Revised' } };
		restarted.record(id, revised, 'host/25');
		restarted.record(id, revised, 'host/25');
		expect(restarted.get(id).transcript).toMatchObject([
			{ kind: 'user' },
			revised,
			{ kind: 'text' },
			checklist
		]);
		restarted.record(id, { kind: 'plan', id: 'review', plan: null });
		restarted.record(id, { kind: 'turn.completed' });
		const next = createWorkspaces(store, repos, dispatch);
		expect(next.get(id).transcript).toMatchObject([{ kind: 'user' }, { kind: 'text' }, checklist]);
		next.send(id, 'Continue the plan');
		next.record(id, checklist);
		expect(next.get(id).transcript.map((item) => item.kind)).toEqual([
			'user',
			'text',
			'user',
			'plan'
		]);
	});

	it('replays a steer after reconnect until the host receives it, and stores replayed output once', () => {
		const { workspaces, sent, create, store, repos, dispatch } = setup();
		const id = create('First');
		workspaces.steer(id, 'Adjust');
		const message = sent.at(-1);
		if (message?.type !== 'agent.message' || !message.deliveryId) throw new Error('Missing steer');
		const restarted = createWorkspaces(store, repos, dispatch);
		restarted.reconcile([id]);
		expect(sent.at(-1)).toMatchObject({
			type: 'agent.message',
			deliveryId: message.deliveryId,
			prompt: 'Adjust'
		});
		restarted.record(id, { kind: 'message.received', id: message.deliveryId }, 'host/10');
		restarted.record(id, { kind: 'text', text: 'Once' }, 'host/20');
		restarted.record(id, { kind: 'text', text: 'Once' }, 'host/20');
		const count = sent.length;
		restarted.reconcile([id]);
		expect(sent).toHaveLength(count);
		expect(restarted.get(id).transcript.filter((item) => item.kind === 'text')).toHaveLength(1);
	});
	it('can be started without a word, and is told what Geordi is with its first message', () => {
		const { workspaces, sent, repo } = setup();
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: '' });
		expect(sent).toEqual([]); // no turn: there is nothing to do yet
		expect(workspaces.get(id)).toMatchObject({
			title: 'New workspace',
			status: 'idle',
			transcript: []
		});

		workspaces.send(id, 'Fix the flaky login test\nIt times out on CI');
		expect(sent.at(-1)).toMatchObject({
			type: 'agent.message',
			resumeId: null,
			instructions: expect.stringContaining('inside Geordi'),
			prompt: 'Fix the flaky login test\nIt times out on CI'
		});
		// and is named after it, as one started with a prompt is
		expect(workspaces.get(id).title).toBe('Fix the flaky login test');
	});

	it('notes a branch its agent renamed, and brings the worktree back from that', () => {
		const { store, workspaces, create } = setup();
		const id = create('Fix the bug');
		workspaces.record(id, { kind: 'worktree', path: '/wt/abc', branch: 'geordi/abc' });

		workspaces.onBranch(id, 'geordi/fix-the-bug');
		expect(workspaces.get(id).worktree).toEqual({ path: '/wt/abc', branch: 'geordi/fix-the-bug' });
		expect(workspaces.ref(id)).toMatchObject({ branch: 'geordi/fix-the-bug' });

		// nothing new, or nothing to go by (a detached HEAD), is not news
		const events = store.readAll().length;
		workspaces.onBranch(id, 'geordi/fix-the-bug');
		workspaces.onBranch(id, null);
		expect(store.readAll()).toHaveLength(events);
	});

	it('carries on in a workspace on a new branch, and tells its agent with the next message', () => {
		const { workspaces, sent, create } = setup();
		const id = create('Fix the bug');
		workspaces.record(id, { kind: 'worktree', path: '/wt/abc', branch: 'geordi/abc' });
		workspaces.record(id, { kind: 'turn.completed' });

		workspaces.continued(id, 'geordi/abc-2');
		const workspace = workspaces.get(id);
		expect(workspace.worktree).toEqual({ path: '/wt/abc', branch: 'geordi/abc-2' });
		// the conversation is as it was, with a word about what happened
		expect(workspace.transcript.map((item) => item.kind)).toEqual(['user', 'note']);
		// a daemon asked to bring the worktree back would bring back this branch
		expect(workspaces.ref(id)).toMatchObject({ branch: 'geordi/abc-2' });

		workspaces.send(id, 'Now the next thing');
		const turn = sent.at(-1) as Extract<ForgeMessage, { type: 'agent.message' }>;
		expect(turn.prompt).toMatch(
			/^\(A note from Geordi.*geordi\/abc-2[\s\S]*\n\nNow the next thing$/
		);
		// said once: the message after that is just the message
		expect(workspaces.get(id).transcript.at(-1)).toMatchObject({
			kind: 'user',
			text: 'Now the next thing'
		});
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.send(id, 'And another');
		expect((sent.at(-1) as typeof turn).prompt).toBe('And another');
	});

	it('runs the next turn with the model and effort chosen since', () => {
		const { workspaces, sent, create, store } = setup();
		const id = create('Fix the bug');
		workspaces.record(id, { kind: 'turn.completed' });

		workspaces.configure(id, { model: 'opus', effort: 'high' });
		workspaces.configure(id, { model: 'opus', effort: 'high' }); // nothing new: nothing recorded
		expect(store.readAll().filter((event) => event.type === 'workspace.configured')).toHaveLength(
			1
		);
		expect(() => workspaces.configure(id, { model: '--evil' })).toThrow();

		workspaces.send(id, 'And the other one');
		expect(sent.at(-1)).toMatchObject({ settings: { model: 'opus', effort: 'high' } });

		// taking a choice back leaves it to the agent's CLI again
		workspaces.configure(id, { model: 'opus' });
		expect(workspaces.get(id).settings).toEqual({ model: 'opus' });
	});

	it('keeps Auto Mode when only the model changes and sends a mode-only change on the next turn', () => {
		const { workspaces, sent, create } = setup();
		const id = create('Start');
		workspaces.configure(id, { permissionMode: 'auto' });
		workspaces.configure(id, { model: 'opus' });
		expect(workspaces.get(id).settings).toEqual({ model: 'opus', permissionMode: 'auto' });
		workspaces.configure(id, { model: 'opus', permissionMode: 'full-access' });
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.send(id, 'Continue');
		expect(sent.at(-1)).toMatchObject({
			settings: { model: 'opus', permissionMode: 'full-access' }
		});
	});

	it('starts a turn on creation and records daemon output', () => {
		const { workspaces, sent, repo, create } = setup();
		const id = create('Fix the bug\nplease');

		expect(sent).toEqual([
			{
				type: 'agent.message',
				workspaceId: id,
				worktreeId: id,
				agent: 'claude',
				settings: {},
				repoPath: repo.path,
				apiToken: expect.any(String),
				resumeId: null,
				instructions: expect.stringContaining('inside Geordi'),
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

	it('records a late result once on its original tool after a forge restart', () => {
		const { workspaces, create, store, repos, dispatch, sent } = setup();
		const id = create('Run a command in the background');
		const tool = { kind: 'tool', id: 'cmd', name: 'exec_command', input: './probe-task' } as const;
		workspaces.record(id, tool);
		workspaces.record(id, { kind: 'text', text: 'WAITING' });
		workspaces.record(id, { kind: 'turn.completed' });
		const restarted = createWorkspaces(store, repos, dispatch);
		const before = store.readAll().length;
		const commands = sent.length;
		const result = { kind: 'tool.result', id: 'cmd', output: '', isError: true } as const;

		// The detached host can repeat the tool announcement before its late result.
		restarted.record(id, { ...tool, input: '' });
		restarted.record(id, { ...result, id: 'unknown' });
		restarted.record(id, result, 'host/50');
		restarted.record(id, result, 'host/50');
		restarted.record(id, { ...result, output: 'duplicate' }, 'host/60');

		expect(store.readAll()).toHaveLength(before + 1);
		expect(sent).toHaveLength(commands);
		expect(createWorkspaces(store, repos, dispatch).get(id)).toMatchObject({
			status: 'idle',
			lastTurn: 'completed',
			transcript: [
				{ kind: 'user' },
				{ ...tool, output: '', isError: true },
				{ kind: 'text', text: 'WAITING' }
			]
		});
	});

	it('runs every turn with the model and effort chosen, and hands them on to agents it starts', () => {
		const { workspaces, sent, repo } = setup();
		const settings = { model: 'opus', effort: 'high', permissionMode: 'auto' } as const;
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', settings, prompt: 'Go' });
		workspaces.record(id, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.send(id, 'More');
		const same = workspaces.agents.start(id, { worktree: 'own', prompt: 'Help' });
		const other = workspaces.agents.start(id, { worktree: 'own', agent: 'codex', prompt: 'Help' });

		const turns = sent.filter((message) => message.type === 'agent.message');
		expect(turns.map((turn) => turn.settings)).toEqual([
			settings,
			settings,
			settings,
			{ permissionMode: 'auto' }
		]);
		expect(workspaces.get(same.id).settings).toEqual(settings);
		// another kind of agent knows other models
		expect(workspaces.get(other.id).settings).toEqual({ permissionMode: 'auto' });
	});

	it('refuses a model or effort that could be mistaken for a flag', () => {
		const { workspaces, repo } = setup();
		const create = (settings: { model?: string; effort?: string }) =>
			workspaces.create({ repoId: repo.id, agent: 'claude', settings, prompt: 'Go' });
		expect(() => create({ model: '--dangerously-skip-permissions' })).toThrow();
		expect(() => create({ effort: 'high; rm -rf /' })).toThrow();
		// nothing chosen is nothing recorded
		expect(workspaces.get(create({ model: '', effort: undefined })).settings).toEqual({});
	});

	it('resumes the CLI session on follow-up messages', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One', 'codex');
		workspaces.record(id, { kind: 'resume', id: 'thread-1' });
		workspaces.record(id, { kind: 'turn.completed' });

		workspaces.send(id, 'Two');
		expect(sent[1]).toMatchObject({ type: 'agent.message', resumeId: 'thread-1', prompt: 'Two' });
	});

	it('queues messages sent while the agent works, and sends them one turn at a time', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.send(id, 'Three');
		expect(sent).toHaveLength(1);
		expect(workspaces.get(id)).toMatchObject({ status: 'running', queue: ['Two', 'Three'] });

		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ type: 'agent.message', prompt: 'Two' });
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

	it('remembers how the latest turn ended, until the next one starts (FDR-008)', () => {
		const { workspaces, create } = setup();
		const id = create('Go');
		expect(workspaces.get(id).lastTurn).toBeNull();
		workspaces.record(id, { kind: 'turn.completed' });
		expect(workspaces.get(id).lastTurn).toBe('completed');
		workspaces.send(id, 'Again');
		expect(workspaces.get(id).lastTurn).toBeNull();
		workspaces.record(id, { kind: 'turn.failed', error: 'Out of tokens' });
		expect(workspaces.get(id).lastTurn).toBe('failed');
		workspaces.send(id, 'Once more');
		workspaces.record(id, { kind: 'turn.failed', error: 'Stopped' });
		expect(workspaces.get(id).lastTurn).toBe('stopped');
	});

	it('lets a waiting message be taken back', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.send(id, 'Three');
		workspaces.dequeue(id, 0, 'Two');
		workspaces.dequeue(id, 7, 'Nothing');
		// the queue moved on since it was looked at: nothing is taken back, rather than the wrong one
		workspaces.dequeue(id, 0, 'Two');
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

	it('steers a working agent: the message reaches it at once, in the middle of its turn', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Later');
		workspaces.steer(id, 'Not that, this');
		// said to the agent as it works: nothing is stopped for it
		expect(sent.at(-1)).toMatchObject({ type: 'agent.message', prompt: 'Not that, this' });
		expect(sent.some((message) => message.type === 'agent.stop')).toBe(false);
		const workspace = workspaces.get(id);
		expect(workspace).toMatchObject({ status: 'running', queue: ['Later'] });
		expect(workspace.transcript.map((item) => item.kind)).toEqual(['user', 'user']);

		// one turn, with both in it; what waits goes out when it is over
		workspaces.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ prompt: 'Later' });
	});

	it('steering an idle agent is just saying something', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.steer(id, 'Two');
		expect(sent.at(-1)).toMatchObject({ type: 'agent.message', prompt: 'Two' });
		expect(workspaces.get(id).status).toBe('running');
	});

	it('does not take a steering message that no daemon is there to pass on', () => {
		const { create, store } = setup();
		const id = create('One');
		const events = store.readAll().length;
		const unreachable = createWorkspaces(store, createRepos(store), () => false);
		expect(() => unreachable.steer(id, 'Two')).toThrow();
		// the turn goes on, wherever it runs: nothing was said, and nothing given up
		expect(store.readAll()).toHaveLength(events);
		expect(unreachable.get(id).status).toBe('running');
	});

	it('replays steering from before it reached a working agent: stopped, then said', () => {
		const { store, repos, dispatch, create } = setup();
		const id = create('One');
		const stream = `workspace:${id}` as const;
		store.append({ type: 'workspace.steered', stream, data: { id, text: 'Two' } });
		store.append({
			type: 'workspace.output',
			stream,
			data: { id, event: { kind: 'turn.failed', error: 'Stopped' } }
		});
		store.append({ type: 'workspace.message', stream, data: { id, text: 'Two', steered: true } });
		const replayed = createWorkspaces(store, repos, dispatch).get(id);
		// being stopped for it is not shown as a failure
		expect(replayed.transcript.map((item) => item.kind)).toEqual(['user', 'user']);
		expect(replayed.status).toBe('running');
	});

	it('lets an agent begin a turn of its own accord, and takes what it does then', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.record(id, { kind: 'turn.completed' });
		const messages = sent.length;

		// something it ran in the background has finished: it speaks up unasked
		workspaces.record(id, { kind: 'turn.started' });
		expect(workspaces.get(id)).toMatchObject({ status: 'running', lastTurn: null });
		expect(workspaces.agents.authenticate(tokenOf(sent[0]))).toBe(id);
		workspaces.record(id, { kind: 'text', text: 'The build is green.' });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(workspaces.get(id)).toMatchObject({ status: 'idle', lastTurn: 'completed' });
		expect(workspaces.get(id).transcript.at(-1)).toMatchObject({ text: 'The build is green.' });
		expect(sent).toHaveLength(messages); // nothing was asked of the daemon for it
	});

	it('shows what an agent asks, and passes on the answer', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		const questions = [
			{
				question: 'Which database?',
				options: [{ label: 'SQLite' }, { label: 'Postgres' }],
				multiSelect: false
			}
		];
		workspaces.record(id, { kind: 'question', id: 'q1', questions });
		expect(workspaces.summary(id).asking).toBe(true);
		expect(workspaces.get(id).transcript.at(-1)).toMatchObject({ kind: 'question', open: true });

		expect(() => workspaces.answer(id, 'q0', ['SQLite'])).toThrow();
		workspaces.answer(id, 'q1', ['SQLite']);
		expect(sent.at(-1)).toEqual({
			type: 'agent.answer',
			workspaceId: id,
			questionId: 'q1',
			answers: ['SQLite']
		});
		expect(workspaces.get(id)).toMatchObject({ asking: false, status: 'running' });
		expect(workspaces.get(id).transcript.at(-1)).toMatchObject({
			answers: ['SQLite'],
			open: false
		});
		expect(() => workspaces.answer(id, 'q1', ['Postgres'])).toThrow(); // answered already
	});

	it('reopens the forge database and retries only answers without a host receipt', () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-answers-')), 'events.db');
		const { create, workspaces, store, repos } = setup({ database });
		const id = create('One');
		const questions = [{ question: 'Go on?', options: [], multiSelect: false }];
		for (const key of ['old', 'pending', 'withdrawn'])
			workspaces.record(id, { kind: 'question', id: key, questions });
		store.append({
			type: 'workspace.answered',
			stream: `workspace:${id}`,
			data: { id, question: 'old', answers: ['Yes'] }
		});
		const disconnected = createWorkspaces(store, repos, () => {
			expect(store.readStream(`workspace:${id}`).at(-1)).toMatchObject({
				type: 'workspace.answered',
				data: { pending: true }
			});
			return false;
		});
		expect(() => disconnected.answer(id, 'pending', [])).toThrow();
		disconnected.answer(id, 'pending', ['Yes']);
		disconnected.answer(id, 'pending', ['Yes']);
		disconnected.answer(id, 'withdrawn', ['Wait']);
		disconnected.record(id, { kind: 'question.closed', id: 'withdrawn' });
		store.close();

		const reopened = new EventStore<GeordiEvent>(database);
		const sent: ForgeMessage[] = [];
		const restart = () =>
			createWorkspaces(reopened, createRepos(reopened), (command) => (sent.push(command), true));
		const forge = restart();
		forge.reconcile([id]);
		expect(sent).toEqual([
			{ type: 'agent.answer', workspaceId: id, questionId: 'pending', answers: ['Yes'] }
		]);
		forge.record(id, { kind: 'answer.received', id: 'pending' }, 'host/25');
		forge.record(id, { kind: 'answer.received', id: 'pending' }, 'host/25');
		forge.record(id, { kind: 'question.closed', id: 'pending' });
		const replay = restart();
		replay.reconcile([id]);
		expect(sent).toHaveLength(1);
		const cards = replay.get(id).transcript.filter((item) => item.kind === 'question');
		expect(cards.map((card) => card.delivery)).toEqual([undefined, undefined, 'unconfirmed']);
		expect(
			reopened.readStream(`workspace:${id}`).filter((event) => event.type === 'workspace.answered')
		).toHaveLength(3);
		reopened.close();
	});

	it('keeps async questions available while only blocking questions need attention', () => {
		const { workspaces, create, sent } = setup();
		const id = create('One');
		const questions = [{ question: 'Go on?', options: [], multiSelect: false }];
		const asyncQuestion = {
			kind: 'question',
			id: 'async',
			questions: questions.map((q) => ({ ...q, optional: true })),
			blocking: false
		} as const;
		workspaces.record(id, asyncQuestion);
		expect(workspaces.summary(id).asking).toBe(false);
		workspaces.record(id, { kind: 'question', id: 'blocking', questions });
		workspaces.record(id, asyncQuestion);
		expect(workspaces.summary(id).asking).toBe(true);
		workspaces.record(id, { kind: 'question.closed', id: 'blocking' });
		expect(workspaces.summary(id).asking).toBe(false);
		expect(() => workspaces.answer(id, 'blocking', ['No'])).toThrow();
		expect(() => workspaces.answer(id, 'async', [''])).toThrow();
		workspaces.answer(id, 'async', ['Yes']);
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.record(id, { kind: 'turn.started' });
		const count = sent.length;
		workspaces.reconcile([id]);
		expect(sent).toHaveLength(count);
		const cards = workspaces.get(id).transcript.filter((item) => item.kind === 'question');
		expect(cards).toHaveLength(2);
		expect(cards[0]).toMatchObject({ open: false, delivery: 'unconfirmed' });
	});

	it('honors a delayed host receipt after the forge stopped the turn offline', () => {
		const { workspaces, create, store, repos } = setup();
		const id = create('One');
		workspaces.record(id, {
			kind: 'question',
			id: 'q',
			questions: [{ question: 'Continue?', multiSelect: false, options: [] }]
		});
		const offline = createWorkspaces(store, repos, () => false);
		offline.answer(id, 'q', ['Yes']);
		offline.stop(id);
		const card = () => offline.get(id).transcript.find((item) => item.kind === 'question');
		expect(card()?.delivery).toBe('unconfirmed');
		offline.record(id, { kind: 'answer.received', id: 'q' });
		expect(card()?.delivery).toBeUndefined();
		expect(offline.summary(id).status).toBe('idle');
	});

	it('no longer waits for an answer once the turn is over', () => {
		const { workspaces, create } = setup();
		const id = create('One');
		const questions = [{ question: 'Go on?', options: [], multiSelect: false }];
		workspaces.record(id, { kind: 'question', id: 'q1', questions });
		workspaces.record(id, { kind: 'turn.failed', error: 'Stopped' });
		expect(workspaces.get(id).asking).toBe(false);
		expect(workspaces.get(id).transcript.find((item) => item.kind === 'question')).toMatchObject({
			answers: null,
			open: false
		});
		expect(() => workspaces.answer(id, 'q1', ['Yes'])).toThrow();
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

	it('stops turns a reconnecting daemon still runs but that were given up here', () => {
		const { workspaces, sent, create } = setup({ connected: false });
		const id = create('One'); // fails at once: no daemon
		expect(workspaces.get(id).status).toBe('idle');

		workspaces.reconcile([id]);
		expect(sent.at(-1)).toEqual({ type: 'agent.stop', workspaceId: id });
	});

	it('takes the end of a turn only once, and nothing of a turn it gave up', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.send(id, 'Three');
		const starts = () => sent.filter((message) => message.type === 'agent.message').length;

		// said twice, as a daemon that was killed mid-report does
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.record(id, { kind: 'turn.started' }); // the next one, as the agent begins it
		workspaces.record(id, { kind: 'turn.started' });
		expect(starts()).toBe(2);
		expect(workspaces.get(id).queue).toEqual(['Three']);

		// given up while the daemon was away: what it then still says of it is not taken
		workspaces.reconcile([]);
		expect(workspaces.get(id).status).toBe('idle');
		const transcript = workspaces.get(id).transcript.length;
		workspaces.record(id, { kind: 'text', text: 'late' });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(workspaces.get(id).transcript).toHaveLength(transcript);
		expect(starts()).toBe(2); // and its end sets nothing off

		workspaces.send(id, 'Four'); // the nudge to go on, with what waited first
		expect(sent.at(-1)).toMatchObject({ type: 'agent.message', prompt: 'Three' });
	});

	it('lists workspaces per repository without their transcripts', () => {
		const { workspaces, repo, create } = setup();
		create('One');
		const [summary] = workspaces.list(repo.id);
		expect(summary).not.toHaveProperty('transcript');
	});
});

describe('titles', () => {
	it('names a workspace after the first line of its first message, until told better', () => {
		const { store, repos, workspaces, dispatch, create } = setup();
		const id = create('fix the login test\nit times out on CI');
		expect(workspaces.get(id).title).toBe('fix the login test');

		workspaces.retitle(id, '  "Fix flaky login test."\nand some more');
		expect(workspaces.get(id).title).toBe('Fix flaky login test');
		workspaces.retitle(id, '   ');
		workspaces.retitle(id, 'x'.repeat(200));
		expect(workspaces.get(id).title).toHaveLength(80);
		expect(createWorkspaces(store, repos, dispatch).get(id).title).toHaveLength(80);
	});

	it('prefers the name someone chose to one a model made of the first message', () => {
		const { workspaces, create } = setup();
		const id = create('Fix the bug in the login flow, it fails on Safari');
		workspaces.suggestTitle(id, 'Fix Safari login');
		expect(workspaces.get(id)).toMatchObject({ title: 'Fix Safari login', named: false });

		// its agent names it: that holds, whatever a model comes up with later
		workspaces.agents.name(id, 'Safari login cookie fix');
		workspaces.suggestTitle(id, 'Login bug');
		expect(workspaces.get(id)).toMatchObject({ title: 'Safari login cookie fix', named: true });
	});

	it('announces new workspaces, including ones agents start, with what started them', () => {
		const { store, repos, repo, dispatch } = setup();
		const created: [string, string][] = [];
		const workspaces = createWorkspaces(store, repos, dispatch, {
			onCreated: (id, prompt) => created.push([id, prompt])
		});
		const lead = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Lead' });
		workspaces.record(lead, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = workspaces.agents.start(lead, { worktree: 'own', prompt: 'Build the thing' });
		expect(created).toEqual([
			[lead, 'Lead'],
			[child.id, 'Build the thing']
		]);
	});
});

describe('moving', () => {
	it('keeps workspaces where a person put them, across a restart', () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-move-')), 'events.db');
		const { workspaces, repo, create } = setup({ database });
		const [a, b, c] = [create('A'), create('B'), create('C')];
		const titles = (list = workspaces.list(repo.id)) => list.map(({ title }) => title);
		expect(titles()).toEqual(['C', 'B', 'A']);

		workspaces.move(a, c);
		expect(titles()).toEqual(['A', 'C', 'B']);
		workspaces.move(a, null);
		expect(titles()).toEqual(['C', 'B', 'A']);
		workspaces.move(c, a);
		expect(titles()).toEqual(['B', 'C', 'A']);
		const updatedAt = workspaces.summary(b).updatedAt;
		workspaces.move(b, null);
		// moving is no news from the workspace
		expect(workspaces.summary(b).updatedAt).toBe(updatedAt);
		expect(titles()).toEqual(['C', 'A', 'B']);

		// new ones still come first
		create('D');
		expect(titles()).toEqual(['D', 'C', 'A', 'B']);
		expect(titles(setup({ database }).workspaces.all())).toEqual(['D', 'C', 'A', 'B']);
	});

	it('moves workspaces only among their repository’s', () => {
		const { workspaces, repos, create } = setup();
		const id = create('A');
		const path = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
		execFileSync('git', ['init', '-q', path]);
		const elsewhere = repos.register(path);
		const other = workspaces.create({ repoId: elsewhere.id, agent: 'claude', prompt: 'B' });
		expect(() => workspaces.move(id, other)).toThrow();
		expect(() => workspaces.move(id, 'missing')).toThrow();
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

	it("adds an agent to a workspace at a person's word: in its worktree, and going when it goes", () => {
		const { workspaces, create, sent } = setup();
		const lead = create('Lead');
		workspaces.record(lead, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const before = sent.length;
		const second = workspaces.join(lead, { agent: 'codex' });

		expect(workspaces.summary(second)).toMatchObject({
			agent: 'codex',
			worktreeId: lead,
			parentId: null,
			status: 'idle',
			worktree: { path: '/wt', branch: 'geordi/lead' }
		});
		// it waits to be told what to do
		expect(sent).toHaveLength(before);
		// told what to do from the start, it sets off
		const third = workspaces.join(lead, { prompt: 'Review this' });
		expect(workspaces.summary(third)).toMatchObject({ status: 'running', worktreeId: lead });
		// one added to it in turn works in the same place
		expect(workspaces.summary(workspaces.join(second)).worktreeId).toBe(lead);
		expect(workspaces.descendants(lead)).toContain(second);
		expect(workspaces.descendants(second)).toEqual([]);
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

	it('leaves out skill instructions that were once recorded as the agent talking', () => {
		const { store, workspaces, create } = setup();
		const id = create('Review it');
		const text = (text: string) =>
			store.append({
				type: 'workspace.output',
				stream: `workspace:${id}`,
				data: { id, event: { kind: 'text', text } }
			});
		text('Base directory for this skill: /wt/.claude/skills/review\n\n# Review\n\nLots of text');
		text('Reviewing now.');

		expect(workspaces.get(id).transcript.map((item) => 'text' in item && item.text)).toEqual([
			'Review it',
			'Reviewing now.'
		]);
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
		const restored = createWorkspaces(store, repos, dispatch);
		restored.record('w', { kind: 'text', text: 'Modern reply' });
		restored.record('w', { kind: 'turn.completed' });
		const before = restored.get('w').transcript;
		restored.archive('w');
		restored.archive('s2');
		const restart = createWorkspaces(store, repos, dispatch);
		const read = vi.spyOn(store, 'readStream');
		restart.summary('w');
		restart.reconcile(['w']);
		expect(read).not.toHaveBeenCalled();
		expect(restart.get('w').transcript).toEqual(before);
		expect(read.mock.calls).toEqual([['workspace:w'], ['session:s1']]);
		expect(restart.agents.workspace('s2').transcript).toEqual([
			{ kind: 'text', text: 'Reviewed.', at: expect.any(String) }
		]);
	});

	it("leaves out a repository's Home workspace and the agents in its checkout, but keeps what it started elsewhere", () => {
		const { store, workspaces, repo } = setup();
		const created = (id: string, data: Record<string, unknown>) =>
			store.append({
				type: 'workspace.created',
				stream: `workspace:${id}`,
				data: { id, repoId: repo.id, agent: 'claude', title: id, ...data } as never
			});
		created('home', { home: true });
		store.append({
			type: 'workspace.message',
			stream: 'workspace:home',
			data: { id: 'home', text: 'Hi' }
		});
		store.append({
			type: 'workspace.cleared',
			stream: 'workspace:home',
			data: { id: 'home' }
		} as never);
		created('aide', { parentId: 'home', worktreeId: 'home' });
		created('task', { parentId: 'home' });

		expect(workspaces.list(repo.id).map((workspace) => workspace.id)).toEqual(['task']);
		expect(workspaces.get('task').parentId).toBeNull();
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

	it('identifies an agent by its token, while it is at work only', () => {
		const { workspaces, agents, sent, lead: caller } = lead();
		const first = tokenOf(sent[0]);

		expect(agents.authenticate(first)).toBe(caller);
		expect(agents.authenticate('made-up')).toBeNull();
		expect(agents.authenticate(`${caller}.forged`)).toBeNull();
		workspaces.record(caller, { kind: 'turn.completed' });
		expect(agents.authenticate(first)).toBeNull();

		// its CLI runs across turns, and keeps the token it was started with
		workspaces.send(caller, 'More');
		expect(tokenOf(sent.at(-1))).toBe(first);
		expect(agents.authenticate(first)).toBe(caller);
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
			type: 'agent.message',
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

		const waiting = agents.wait(id, id, 5000);
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
		agents.send(caller, id, 'Finish');
		const final = agents.wait(id, id, 5000);
		workspaces.record(id, { kind: 'text', text: 'Archived reply' });
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.archive(id); // the waiting report resumes after eviction
		expect(await final).toMatchObject({ reply: 'Archived reply', error: null });
	});

	it('gives up waiting after the timeout', async () => {
		const { agents, lead: caller } = lead();
		const { id } = agents.start(caller, { worktree: 'shared', prompt: 'Go' });
		expect(await agents.wait(id, id, 10)).toMatchObject({ status: 'running' });
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

describe('agents talking to the agents they started', () => {
	function family() {
		const { workspaces, create, sent } = setup();
		const lead = create('Lead');
		workspaces.record(lead, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = workspaces.agents.start(lead, { worktree: 'own', prompt: 'Build' }).id;
		const said = () =>
			workspaces
				.get(child)
				.transcript.flatMap((item) => (item.kind === 'user' ? [[item.text, item.from]] : []));
		return { workspaces, lead, child, said, sent };
	}

	it('has a message to a working agent wait for its turn to end, and marks whose it is', () => {
		const { workspaces, lead, child, said } = family();
		workspaces.agents.send(lead, child, 'Also update the docs');
		expect(workspaces.get(child)).toMatchObject({
			status: 'running',
			queue: ['Also update the docs']
		});

		workspaces.record(child, { kind: 'turn.completed' });
		expect(workspaces.get(child)).toMatchObject({ status: 'running', queue: [] });
		// what its parent said is the parent's; a person's words are nobody's in particular
		expect(said()).toEqual([
			['Build', lead],
			['Also update the docs', lead]
		]);
		workspaces.record(child, { kind: 'turn.completed' });
		workspaces.send(child, 'Thanks');
		expect(said().at(-1)).toEqual(['Thanks', undefined]);
	});

	it('tells a working agent at once what a message that interrupts says', () => {
		const { workspaces, lead, child, said, sent } = family();
		workspaces.agents.send(lead, child, 'Stop: wrong directory', true);
		expect(sent.at(-1)).toMatchObject({
			type: 'agent.message',
			workspaceId: child,
			prompt: 'Stop: wrong directory'
		});
		expect(workspaces.get(child)).toMatchObject({ status: 'running', lastTurn: null });
		expect(said().at(-1)).toEqual(['Stop: wrong directory', lead]);
	});

	it('remembers a turn that failed until the agent is told something again', () => {
		const { workspaces, lead, child } = family();
		workspaces.record(child, { kind: 'turn.failed', error: 'boom' });
		expect(workspaces.summary(child).lastTurn).toBe('failed');
		workspaces.agents.send(lead, child, 'Again');
		expect(workspaces.summary(child).lastTurn).toBeNull();
		// stopped on purpose is not failed
		workspaces.stop(child);
		workspaces.record(child, { kind: 'turn.failed', error: 'Stopped' });
		expect(workspaces.summary(child).lastTurn).toBe('stopped');
	});
});

describe('messages with images', () => {
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
		'base64'
	);
	it('starts an image-only workspace, and keeps queued and steering pictures across a forge restart', () => {
		const { store, repos, workspaces, repo, sent, dispatch } = setup();
		const imageStore = createImages(store);
		const first = imageStore.add(png);
		const second = imageStore.add(png);
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: '', images: [first] });
		expect(sent.at(-1)).toMatchObject({
			type: 'agent.message',
			prompt: '',
			images: [imageStore.get(first)]
		});
		workspaces.send(id, '', null, [second]);
		workspaces.steer(id, 'Look here', null, [first, second]);
		expect(sent.at(-1)).toMatchObject({
			prompt: 'Look here',
			images: [imageStore.get(first), imageStore.get(second)]
		});
		const restarted = createWorkspaces(store, repos, dispatch);
		expect(restarted.get(id).attachments).toEqual({ queue: [[second]] });
		restarted.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ prompt: '', images: [imageStore.get(second)] });
		expect(restarted.get(id)).toMatchObject({
			queue: [],
			attachments: { queue: [] },
			transcript: [
				{ kind: 'user', images: [first] },
				{ kind: 'user', images: [first, second] },
				{ kind: 'user', images: [second] }
			]
		});
	});

	it('keeps identical image-only queued messages distinct when taking one back', () => {
		const { store, workspaces, create } = setup();
		const imageStore = createImages(store);
		const first = imageStore.add(png);
		const second = imageStore.add(png);
		const id = create('Go');
		workspaces.send(id, '', null, [first]);
		workspaces.send(id, '', null, [second]);
		workspaces.dequeue(id, 0, '', null, [first]);
		workspaces.dequeue(id, 0, '', null, [first]); // stale browser snapshot
		expect(workspaces.get(id).attachments.queue).toEqual([[second]]);
	});

	it('validates image references before recording a message or workspace', () => {
		const { store, workspaces, repo, create } = setup();
		const id = create('Go');
		const count = store.readAll().length;
		expect(() => workspaces.send(id, '', null, ['missing'])).toThrow();
		expect(() => workspaces.steer(id, '', null, ['missing'])).toThrow();
		expect(() =>
			workspaces.create({ repoId: repo.id, agent: 'codex', prompt: '', images: ['missing'] })
		).toThrow();
		expect(store.readAll()).toHaveLength(count);
	});
});
