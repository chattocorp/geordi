import { createImages } from './images.ts';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	renameSync,
	statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Agent, AgentEvent, ForgeMessage } from '@geordi/protocol';
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
	const create = (prompt: string, agent: Agent = 'claude') =>
		workspaces.create({ repoId: repo.id, agent, prompt });
	return { store, repos, workspaces, sent, repo, create, dispatch };
}

function acknowledgePrompt(
	workspaces: ReturnType<typeof createWorkspaces>,
	command: ForgeMessage | undefined
) {
	if (command?.type !== 'agent.message' || !command.deliveryId) throw new Error('Missing delivery');
	workspaces.record(command.workspaceId, { kind: 'message.received', id: command.deliveryId });
}

const tokenOf = (message: ForgeMessage | undefined) =>
	(message as Extract<ForgeMessage, { type: 'agent.message' }>).apiToken;

/** Matches the error a refused request throws, by its message. */
const refusal = (message: RegExp) =>
	expect.objectContaining({
		body: expect.objectContaining({ message: expect.stringMatching(message) })
	});

describe('workspaces', () => {
	it('finds idle workspaces whose worktree it never heard of, and records each once', () => {
		const { workspaces, sent, create, store } = setup();
		const id = create('Hello');
		acknowledgePrompt(workspaces, sent.at(-1));
		workspaces.record(id, { kind: 'turn.started' });
		workspaces.record(id, { kind: 'resume', id: 'session' });
		expect(workspaces.unplaced()).toEqual([]); // at work: its turn may be making it
		workspaces.record(id, { kind: 'turn.completed' });
		expect(workspaces.unplaced()).toEqual([id]);

		const worktree = { kind: 'worktree', path: '/wt', branch: 'geordi/x' } as const;
		workspaces.record(id, worktree);
		const recorded = store.readAll().length;
		workspaces.record(id, worktree);
		expect(store.readAll().length).toBe(recorded);
		expect(workspaces.unplaced()).toEqual([]);
	});

	it('reads one archived transcript for concurrent file requests and forgets a purged workspace', async () => {
		const { workspaces, store, create } = setup();
		const id = create('Review');
		const blobs = { old: '1234567', new: '2345678' };
		workspaces.record(id, {
			kind: 'turn.completed',
			diff: {
				added: 2,
				removed: 2,
				files: [
					{ path: 'a', operation: 'modify', blobs },
					{ path: 'b', operation: 'modify' }
				],
				patch:
					'diff --git a/b b/b\nindex abcd123..efab456 100644\n--- a/b\n+++ b/b\n@@ -1 +1 @@\n-old\n+new\n'
			}
		});
		workspaces.archive(id);
		const reads = vi.spyOn(store, 'readStream');
		expect(
			await Promise.all(['a', 'b', 'unlisted'].map((path) => workspaces.turnBlobs(id, 1, path)))
		).toEqual([blobs, { old: 'abcd123', new: 'efab456' }, undefined]);
		expect(reads.mock.calls.filter(([stream]) => stream === `workspace:${id}`)).toHaveLength(1);
		workspaces.purge([id]);
		await expect(workspaces.turnBlobs(id, 1, 'a')).rejects.toThrow();
	});

	it('replays an older worktree without assigning it a new parent directory', () => {
		const { repo, store, repos, dispatch } = setup();
		store.append({
			type: 'workspace.created',
			stream: 'workspace:old',
			data: { id: 'old', repoId: repo.id, title: 'Old workspace', agent: 'codex' }
		});
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.ref('old')).toEqual({ repoPath: repo.path, worktreeId: 'old' });
	});

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
			{ kind: 'turn' },
			{ kind: 'user' }
		]);
	});

	it('records when a turn began and what it used with its end, and keeps it across a restart', () => {
		const { workspaces, create, store, repos, dispatch } = setup();
		const id = create('Count');
		const usage = { totalTokens: 361, inputTokens: 8, outputTokens: 353 };
		workspaces.record(id, { kind: 'text', text: 'Counted.' });
		workspaces.record(id, { kind: 'turn.completed', usage });
		workspaces.send(id, 'Again');
		workspaces.record(id, { kind: 'turn.failed', error: 'Stopped', usage });
		workspaces.send(id, 'Once more');
		// as recorded before turns said what they used
		workspaces.record(id, { kind: 'turn.completed' });
		const replay = createWorkspaces(store, repos, dispatch);
		const transcript = replay.get(id).transcript;
		expect(transcript.map((item) => item.kind)).toEqual([
			'user',
			'text',
			'turn',
			'user',
			'error',
			'turn',
			'user',
			'turn'
		]);
		expect(transcript[2]).toMatchObject({ kind: 'turn', usage, startedAt: transcript[0].at });
		expect(transcript[7]).toEqual({
			kind: 'turn',
			startedAt: transcript[6].at,
			at: expect.any(String)
		});
	});

	it('keeps a compaction where it began, and ends one left running with its turn', () => {
		const { workspaces, create, store, repos, dispatch } = setup();
		const id = create('Keep going');
		workspaces.record(id, { kind: 'compaction', id: 'c1', status: 'running' });
		workspaces.record(id, { kind: 'text', text: 'Carrying on.' });
		const began = workspaces.get(id).transcript[1].at;
		workspaces.record(id, {
			kind: 'compaction',
			id: 'c1',
			status: 'completed',
			tokensBefore: 183000,
			tokensAfter: 21000
		});
		workspaces.record(id, { kind: 'compaction', id: 'c2', status: 'running' });
		workspaces.record(id, { kind: 'turn.completed' });
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.get(id).transcript).toMatchObject([
			{ kind: 'user' },
			{ kind: 'compaction', id: 'c1', status: 'completed', tokensAfter: 21000, at: began },
			{ kind: 'text' },
			{ kind: 'compaction', id: 'c2', status: 'cancelled' },
			{ kind: 'turn' }
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
		expect(next.get(id).transcript).toMatchObject([
			{ kind: 'user' },
			{ kind: 'text' },
			checklist,
			{ kind: 'turn' }
		]);
		next.send(id, 'Continue the plan');
		next.record(id, checklist);
		expect(next.get(id).transcript.map((item) => item.kind)).toEqual([
			'user',
			'text',
			'turn',
			'user',
			'plan'
		]);
	});

	it('replays a steer after reconnect until the host receives it, and stores replayed output once', () => {
		const { workspaces, sent, create, store, repos, dispatch } = setup();
		const id = create('First');
		acknowledgePrompt(workspaces, sent.at(-1));
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
		expect(workspace.transcript.map((item) => item.kind)).toEqual(['user', 'turn', 'note']);
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

	it('tells Claude that Geordi started it only once that was chosen, and after a restart', () => {
		const { workspaces, sent, create, store, repos, dispatch } = setup();
		create('Off by default');
		expect(sent.at(-1)).not.toHaveProperty('identify');

		workspaces.preferences.set({ identifyClaude: true });
		create('Now on');
		expect(sent.at(-1)).toMatchObject({ agent: 'claude', identify: true });
		create('Not Claude', 'codex');
		expect(sent.at(-1)).not.toHaveProperty('identify');

		const replayed = createWorkspaces(store, repos, dispatch);
		expect(replayed.preferences.get()).toEqual({ identifyClaude: true });
		replayed.preferences.set({ identifyClaude: false });
		expect(replayed.preferences.get()).toEqual({ identifyClaude: false });
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
				worktreeParent: repo.id,
				apiToken: expect.any(String),
				resumeId: null,
				instructions: expect.stringContaining('inside Geordi'),
				prompt: 'Fix the bug\nplease',
				deliveryId: expect.any(String)
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
		expect(workspace.transcript.map((item) => item.kind)).toEqual(['user', 'tool', 'text', 'turn']);
		expect(workspace.transcript[1]).toMatchObject({ output: 'contents', isError: false });
	});

	it('completes a tool call with what later updates say of it', () => {
		const { workspaces, create } = setup();
		const id = create('Read a file');
		workspaces.record(id, {
			kind: 'tool',
			id: 't1',
			name: 'Read',
			input: '{}',
			title: 'Read File'
		});
		workspaces.record(id, {
			kind: 'tool.update',
			id: 't1',
			input: '{"file_path":"/wt/a.txt"}',
			title: 'Read a.txt',
			toolKind: 'read',
			locations: [{ path: '/wt/a.txt', line: 1 }]
		});
		workspaces.record(id, { kind: 'tool.update', id: 'unknown', title: 'Nothing' });
		expect(workspaces.get(id).transcript.filter((item) => item.kind === 'tool')).toEqual([
			{
				kind: 'tool',
				id: 't1',
				name: 'Read',
				input: '{"file_path":"/wt/a.txt"}',
				title: 'Read a.txt',
				toolKind: 'read',
				locations: [{ path: '/wt/a.txt', line: 1 }],
				output: null,
				isError: false,
				at: expect.any(String)
			}
		]);
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
				{ kind: 'text', text: 'WAITING' },
				{ kind: 'turn' }
			]
		});
	});

	it('starts a child from the repository’s base, or from the branch it is given', () => {
		const { workspaces, repo } = setup();
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Go' });
		const fresh = workspaces.agents.start(id, { worktree: 'own', prompt: 'Help' });
		expect(workspaces.ref(fresh.id)).not.toHaveProperty('base');

		workspaces.record(id, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const built = workspaces.agents.start(id, {
			worktree: 'own',
			base: 'geordi/lead',
			prompt: 'Build on it'
		});
		expect(workspaces.ref(built.id)).toMatchObject({ base: 'geordi/lead' });
		// one base, as it was given: the comparison never moves to another branch
		workspaces.onBranch(id, 'perf/renamed');
		expect(workspaces.ref(built.id)).toMatchObject({ base: 'geordi/lead' });
	});

	it('starts a workspace from a branch a person chose, and refuses what is no branch name', () => {
		const { workspaces, repo } = setup();
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Go', base: 'dev' });
		expect(workspaces.ref(id)).toMatchObject({ base: 'dev' });
		expect(() =>
			workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Go', base: '-x' })
		).toThrow(refusal(/not a branch name/));
	});

	it('compares a worktree with another base from then on, for everyone working in it', () => {
		const { workspaces, repo, store, repos, dispatch } = setup();
		const id = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Go', base: 'dev' });
		const aide = workspaces.join(id);

		// a reviewer working there moves it for the worktree's owner
		workspaces.setBase(aide, 'release/2', 'person');
		expect(workspaces.ref(id)).toMatchObject({ base: 'release/2' });
		expect(workspaces.ref(aide)).toMatchObject({ base: 'release/2' });
		const recorded = store.readAll().length;
		workspaces.setBase(id, 'release/2');
		expect(store.readAll().length).toBe(recorded);
		// said in the conversation: what the changes are shown against is never changed unseen
		expect(workspaces.get(id).transcript.at(-1)).toMatchObject({
			kind: 'note',
			text: 'Now compared with release/2'
		});
		workspaces.record(id, { kind: 'worktree', path: '/wt', branch: 'geordi/mine' });
		expect(() => workspaces.setBase(id, 'geordi/mine')).toThrow(refusal(/its own branch/));

		// back to where work in the repository starts, as on a replay
		workspaces.setBase(id, null);
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.ref(id)).not.toHaveProperty('base');
		expect(replay.get(aide).base).toBeNull();
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

	it('keeps action identity through a queued repair, a forge restart and the end of the turn', () => {
		const { workspaces, store, repos, dispatch, create } = setup();
		const id = create('Investigate');
		workspaces.send(id, 'Skip this');
		workspaces.send(id, 'Repair', null, [], 'fix-checks');
		expect(workspaces.summary(id).activeAction).toBeUndefined();
		workspaces.dequeue(id, 0, 'Skip this');
		const restored = createWorkspaces(store, repos, dispatch);
		restored.record(id, { kind: 'turn.completed' });
		expect(restored.summary(id).activeAction).toBe('fix-checks');
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.summary(id).activeAction).toBe('fix-checks');
		replay.record(id, { kind: 'turn.failed', error: 'Stopped' });
		expect(replay.summary(id).activeAction).toBeUndefined();
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

	it('keeps a workspace inactive until a person marks it active or prompts it, also across a restart', () => {
		const { workspaces, store, repos, dispatch, create } = setup();
		const id = create('One');
		const other = create('Other');
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.setInactive(id, true);
		expect(workspaces.get(id).inactive).toBe(true);
		// what an agent says or does leaves it inactive
		workspaces.send(id, 'From an agent', other);
		workspaces.record(id, { kind: 'turn.completed' });
		const restored = createWorkspaces(store, repos, dispatch);
		expect(restored.get(id).inactive).toBe(true);
		restored.send(id, 'Two');
		expect(restored.get(id).inactive).toBe(false);
		const again = createWorkspaces(store, repos, dispatch);
		expect(again.get(id).inactive).toBe(false);
		again.setInactive(id, true);
		expect(again.get(id).inactive).toBe(true);
		again.setInactive(id, false);
		expect(createWorkspaces(store, repos, dispatch).get(id).inactive).toBe(false);
	});

	it('makes the workspaces that started one active again when a person prompts it', () => {
		const { workspaces, create } = setup();
		const root = create('Root');
		workspaces.record(root, { kind: 'turn.completed' });
		const child = workspaces.agents.start(root, { worktree: 'own', prompt: 'Help' }).id;
		workspaces.record(child, { kind: 'turn.completed' });
		workspaces.setInactive(root, true);
		workspaces.send(child, 'Explain this');
		expect(workspaces.get(root).inactive).toBe(false);
		// marking it active does the same
		workspaces.setInactive(root, true);
		workspaces.setInactive(child, false);
		expect(workspaces.get(root).inactive).toBe(false);
	});

	it('reads a workspace removed from Today, before inactive ones, as inactive', () => {
		const { store, repos, dispatch, create } = setup();
		const id = create('One');
		store.append({ type: 'workspace.setAside', stream: `workspace:${id}`, data: { id } } as never);
		expect(createWorkspaces(store, repos, dispatch).get(id).inactive).toBe(true);
	});

	it('keeps a workspace locked against archiving until a person unlocks it, across a restart', () => {
		const { workspaces, store, repos, dispatch, create } = setup();
		const id = create('One');
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.lock(id, true);
		expect(() => workspaces.archive(id)).toThrow();
		const restored = createWorkspaces(store, repos, dispatch);
		expect(restored.get(id).locked).toBe(true);
		restored.lock(id, false);
		expect(createWorkspaces(store, repos, dispatch).get(id).locked).toBe(false);
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

	it('queues a steer to a working OpenCode session across forge replay', () => {
		const { workspaces, store, repos, dispatch, sent, create } = setup();
		const id = create('One', 'opencode');
		workspaces.steer(id, 'Two');
		expect(sent).toHaveLength(1);
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.get(id).queue).toEqual(['Two']);
		replay.record(id, { kind: 'turn.completed' });
		expect(sent.at(-1)).toMatchObject({ type: 'agent.message', prompt: 'Two' });
		expect(replay.get(id).queue).toEqual([]);
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

	it('delivers pending prompts in order after the daemon returns', () => {
		const { create, store, repos } = setup({ connected: false });
		const id = create('One');
		createWorkspaces(store, repos, () => false).steer(id, 'Two');
		const sent: string[] = [];
		createWorkspaces(store, repos, (message) => {
			if (message.type === 'agent.message') sent.push(message.prompt);
			return true;
		}).reconcile([]);
		expect(sent).toEqual(['One', 'Two']);
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
		expect(replayed.transcript.map((item) => item.kind)).toEqual(['user', 'turn', 'user']);
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
		expect(workspaces.get(id).transcript.slice(-2)).toMatchObject([
			{ text: 'The build is green.' },
			{ kind: 'turn', startedAt: expect.any(String) }
		]);
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
		const { create, workspaces, store, repos, sent: commands } = setup({ database });
		const id = create('One');
		acknowledgePrompt(workspaces, commands.at(-1));
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
		acknowledgePrompt(workspaces, sent.at(-1));
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

	it('keeps how full the context is in memory during a turn, and records it once at its end', () => {
		const { store, repos, workspaces, dispatch, create } = setup();
		const id = create('Count');
		workspaces.record(id, { kind: 'turn.started' });
		const changed = vi.fn();
		const unfollow = workspaces.followUsage(changed);
		const recorded = () => store.readAll().filter((event) => event.type === 'workspace.usage');
		expect(workspaces.summary(id).usage).toBeNull();
		for (const used of [1000, 2000, 3000]) workspaces.measure(id, { used, size: 10_000 });
		workspaces.measure(id, { used: 3000, size: 10_000 });
		expect(changed).toHaveBeenCalledTimes(3);
		expect(workspaces.summary(id).usage).toEqual({ used: 3000, size: 10_000 });
		expect(recorded()).toHaveLength(0);

		const cost = { amount: 0.27, currency: 'USD' };
		workspaces.measure(id, { used: 3500, size: 10_000, cost });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(recorded()).toHaveLength(1);
		// after a restart, as it was; a daemon that says it again records nothing new
		const restarted = createWorkspaces(store, repos, dispatch);
		expect(restarted.summary(id).usage).toEqual({ used: 3500, size: 10_000, cost });
		restarted.measure(id, { used: 3500, size: 10_000, cost });
		expect(recorded()).toHaveLength(1);
		// said between turns, it is recorded at once
		restarted.measure(id, { used: 3600, size: 10_000, cost });
		expect(recorded()).toHaveLength(2);
		unfollow();
	});

	it('records what the agent suggests, until its next turn', () => {
		const { store, repos, workspaces, dispatch, create } = setup();
		const id = create('Suggest');
		workspaces.record(id, { kind: 'turn.started' });
		// said while it works, it was meant for a turn that is over
		workspaces.suggest(id, 'Too early');
		expect(workspaces.summary(id).suggestion).toBeNull();
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.suggest(id, 'Ship it');
		const recorded = () => store.readAll().filter((event) => event.type === 'workspace.suggested');
		// after a restart, still there; a daemon that says it again records nothing new
		const restarted = createWorkspaces(store, repos, dispatch);
		expect(restarted.summary(id).suggestion).toBe('Ship it');
		restarted.suggest(id, 'Ship it');
		expect(recorded()).toHaveLength(1);
		restarted.record(id, { kind: 'turn.started' });
		expect(restarted.summary(id).suggestion).toBeNull();
	});

	it('withdraws a suggestion when a message starts the next turn', () => {
		const { store, repos, workspaces, dispatch, create } = setup();
		const id = create('Suggest');
		workspaces.record(id, { kind: 'turn.started' });
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.suggest(id, 'Ship it');
		// the reply starts the turn, so the agent's own word of it is dropped
		workspaces.send(id, 'Not yet');
		workspaces.record(id, { kind: 'turn.started' });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(workspaces.summary(id).suggestion).toBeNull();
		expect(createWorkspaces(store, repos, dispatch).summary(id).suggestion).toBeNull();
	});

	it('keeps the queue across a restart', () => {
		const { store, repos, workspaces, dispatch, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		expect(createWorkspaces(store, repos, dispatch).get(id).queue).toEqual(['Two']);
	});

	it('records a first prompt before dispatch and retries the same delivery after restart', () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-prompts-')), 'events.db');
		const { store, repos, create } = setup({ database });
		const id = create('');
		const verify = vi.fn((command: ForgeMessage) => {
			if (command.type !== 'agent.message') throw new Error('Expected a prompt');
			expect(store.readStream(`workspace:${id}`).at(-1)).toMatchObject({
				type: 'workspace.message',
				data: { deliveryId: command.deliveryId, text: 'One' }
			});
			return false;
		});
		createWorkspaces(store, repos, verify, { secret: 'test' }).send(id, 'One');
		store.close();
		const reopened = new EventStore<GeordiEvent>(database);
		const retry = vi.fn(() => true);
		const restarted = createWorkspaces(reopened, createRepos(reopened), retry, { secret: 'test' });
		restarted.reconcile([]);
		expect(retry).toHaveBeenCalledExactlyOnceWith(verify.mock.calls[0][0]);
		acknowledgePrompt(restarted, verify.mock.calls[0][0]);
		restarted.reconcile([id]);
		expect(retry).toHaveBeenCalledTimes(1);
		reopened.close();
	});

	it('keeps a prompt local if the event store cannot record it', () => {
		const { store, workspaces, create, sent } = setup();
		const id = create('');
		vi.spyOn(store, 'append').mockImplementationOnce(() => {
			throw new Error('Disk full');
		});
		expect(() => workspaces.send(id, 'Run the job')).toThrow('Disk full');
		expect(sent).toEqual([]);
	});

	it('resumes a queue if the forge stopped after recording completion', () => {
		const { store, repos, create, workspaces, sent, dispatch } = setup();
		const id = create('One');
		acknowledgePrompt(workspaces, sent.at(-1));
		workspaces.send(id, 'Two');
		store.append({
			type: 'workspace.output',
			stream: `workspace:${id}`,
			data: { id, event: { kind: 'turn.completed' } }
		});
		const restored = createWorkspaces(store, repos, dispatch);
		restored.reconcile([]);
		const next = sent.at(-1);
		expect(next).toMatchObject({
			type: 'agent.message',
			prompt: 'Two',
			deliveryId: expect.any(String)
		});
		expect(restored.get(id).queue).toEqual([]);
		acknowledgePrompt(restored, next);
		restored.reconcile([id]);
		expect(sent).toHaveLength(2);
	});

	it('fails turns a reconnecting daemon no longer knows about', () => {
		const { workspaces, repo, create, sent } = setup();
		const lost = create('One');
		acknowledgePrompt(workspaces, sent.at(-1));
		const alive = create('Two');

		workspaces.reconcile([alive]);
		expect(workspaces.list(repo.id).map((workspace) => [workspace.id, workspace.status])).toEqual([
			[alive, 'running'],
			[lost, 'idle']
		]);
	});

	it('stops turns a reconnecting daemon still runs but that were given up here', () => {
		const { workspaces, sent, create } = setup({ connected: false });
		const id = create('One');
		workspaces.stop(id);
		expect(workspaces.get(id).status).toBe('idle');

		workspaces.reconcile([id]);
		expect(sent.at(-1)).toEqual({ type: 'agent.stop', workspaceId: id });
	});

	it('takes the end of a turn only once, and nothing of a turn it gave up', () => {
		const { workspaces, sent, create } = setup();
		const id = create('One');
		workspaces.send(id, 'Two');
		workspaces.send(id, 'Three');
		acknowledgePrompt(workspaces, sent[0]);
		const starts = () => sent.filter((message) => message.type === 'agent.message').length;

		// said twice, as a daemon that was killed mid-report does
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.record(id, { kind: 'turn.started' }); // the next one, as the agent begins it
		workspaces.record(id, { kind: 'turn.started' });
		expect(starts()).toBe(2);
		expect(workspaces.get(id).queue).toEqual(['Three']);

		acknowledgePrompt(workspaces, sent.at(-1));
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

	it('uses the same short title for an initial prompt and a first message sent later', () => {
		const { workspaces, create } = setup();
		const prefix = '“Please update the workspace header so it shows a shorter';
		const prompt = prefix + ' description while the agent is working.';
		const initial = create(prompt);
		const later = create('');
		workspaces.send(later, prompt);
		for (const id of [initial, later]) {
			expect(workspaces.get(id).title).toBe(prefix + '…');
			expect(workspaces.get(id).transcript).toContainEqual(
				expect.objectContaining({ kind: 'user', text: prompt })
			);
		}
	});

	it('takes the title its agent gives its session, until someone names it', () => {
		const { store, repos, dispatch, workspaces, create } = setup();
		const id = create('Fix the bug in the login flow,\nit fails on Safari');
		// Codex says the prompt back first, whitespace collapsed and maybe cut short
		workspaces.record(id, {
			kind: 'title',
			title: 'Fix the bug in the login flow, it fails on Safari'
		});
		workspaces.record(id, { kind: 'title', title: 'Fix the bug in the login…' });
		expect(workspaces.get(id).title).toBe('Fix the bug in the login flow,');

		workspaces.record(id, { kind: 'title', title: 'Fix Safari login' });
		expect(workspaces.get(id)).toMatchObject({ title: 'Fix Safari login', named: false });
		// a later one replaces it, even between turns
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.record(id, { kind: 'title', title: 'Safari login cookies' });
		expect(workspaces.get(id).title).toBe('Safari login cookies');

		// its agent names it: that holds, whatever its session is called later
		workspaces.agents.name(id, 'Safari login cookie fix');
		workspaces.record(id, { kind: 'title', title: 'Login bug' });
		expect(workspaces.get(id)).toMatchObject({ title: 'Safari login cookie fix', named: true });
		expect(createWorkspaces(store, repos, dispatch).get(id).title).toBe('Safari login cookie fix');
	});

	it('keeps a manually confirmed name through agent updates and replay', () => {
		const { store, repos, dispatch, workspaces, create } = setup();
		const id = create('Do the thing');
		workspaces.agents.name(id, 'Investigate login');
		workspaces.rename(id, 'Investigate login');
		const replayed = createWorkspaces(store, repos, dispatch);
		expect(() => replayed.agents.name(id, 'Agent rename')).toThrow();
		replayed.record(id, { kind: 'title', title: 'Session rename' });
		expect(replayed.get(id).title).toBe('Investigate login');
		replayed.rename(id, ' Login in v2.0. ');
		expect(replayed.get(id).title).toBe('Login in v2.0.');
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

	it('moves workspaces across repositories, as one list', () => {
		const { workspaces, repos, create } = setup();
		const id = create('A');
		const path = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
		execFileSync('git', ['init', '-q', path]);
		const elsewhere = repos.register(path);
		const other = workspaces.create({ repoId: elsewhere.id, agent: 'claude', prompt: 'B' });
		workspaces.move(id, other);
		expect(workspaces.all().map(({ title }) => title)).toEqual(['A', 'B']);
		expect(() => workspaces.move(id, 'missing')).toThrow();
	});
});

describe('moving in the outline (FDR-016)', () => {
	function family(options?: Parameters<typeof setup>[0]) {
		const context = setup(options);
		const [lead, peer] = [context.create('Lead'), context.create('Peer')];
		const { agents } = context.workspaces;
		const child = agents.start(lead, { worktree: 'own', prompt: 'Help' }).id;
		return { ...context, agents, lead, peer, child };
	}

	it('hands a workspace to its new parent, across a restart', () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-outline-')), 'events.db');
		const { workspaces, agents, lead, peer, child } = family({ database });
		workspaces.move(child, null, peer);
		expect(workspaces.get(child).parentId).toBe(peer);
		expect(() => agents.send(lead, child, 'Still mine?')).toThrow();
		expect(() => agents.stop(lead, child)).toThrow();
		agents.send(peer, child, 'Yours now');
		expect(setup({ database }).workspaces.get(child).parentId).toBe(peer);

		workspaces.move(child, null, null);
		expect(workspaces.get(child).parentId).toBeNull();
		expect(() => agents.send(peer, child, 'And now?')).toThrow();
	});

	it('moves a subtree with its root, and refuses loops', () => {
		const { workspaces, agents, lead, peer, child } = family();
		const grandchild = agents.start(child, { worktree: 'own', prompt: 'Deeper' }).id;
		expect(() => workspaces.move(lead, null, grandchild)).toThrow(refusal(/under itself/));
		expect(() => workspaces.move(child, null, child)).toThrow(refusal(/under itself/));
		workspaces.move(lead, null, peer);
		expect(workspaces.get(grandchild).parentId).toBe(child);
		expect(workspaces.descendants(peer).sort()).toEqual([lead, child, grandchild].sort());
	});

	it('ends the old parent’s wait and gives its open questions to the person', async () => {
		const { workspaces, agents, lead, peer, child } = family();
		const waiting = agents.wait(lead, child, 30000);
		workspaces.move(child, null, peer);
		expect(await waiting).toMatchObject({ movedAway: true, parentId: peer });

		workspaces.move(child, null, lead);
		const questions = [{ question: 'Which?', options: [], multiSelect: false }];
		workspaces.record(child, { kind: 'question', id: 'q', questions });
		expect(await agents.wait(lead, child, 30000)).toHaveProperty('parentQuestions');
		workspaces.move(child, null, null);
		expect(workspaces.get(child).asking).toBe(true);
	});

	it('archives the whole subtree, in every repository', () => {
		const { workspaces, repos, agents, lead } = family();
		const path = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
		execFileSync('git', ['init', '-q', path]);
		const elsewhere = repos.register(path);
		const away = agents.start(lead, {
			worktree: 'own',
			prompt: 'Over there',
			repository: elsewhere.id
		}).id;
		expect(workspaces.descendants(lead)).toContain(away);
	});

	it('keeps projects out of the tree', () => {
		const { workspaces, lead } = family();
		const project = workspaces.create({ repoId: null, agent: 'claude', prompt: 'Plan' });
		expect(() => workspaces.move(project, null, lead)).toThrow(refusal(/Projects/));
		expect(() => workspaces.move(lead, null, project)).toThrow(refusal(/Projects/));
	});
});

describe('the outline of items (FDR-017)', () => {
	const tree = (workspaces: ReturnType<typeof setup>['workspaces']) => {
		const { items, order } = workspaces.outline();
		return order.map((id) => [
			items.get(id)!.text || workspaces.get(id).title,
			items.get(id)!.parentId
		]);
	};

	it('keeps items, with what is in them, across a restart', () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-items-')), 'events.db');
		const { workspaces } = setup({ database });
		const release = workspaces.addItem({ parentId: null, before: null, text: 'Release 0.9' });
		const notes = workspaces.addItem({ parentId: release, before: null, text: 'Notes\nfor it' });
		const first = workspaces.addItem({ parentId: release, before: notes, text: 'Bump it' });
		workspaces.editItem(notes, { text: 'Write the notes', note: 'In German too' });
		workspaces.completeItem(first, true);
		const replayed = setup({ database }).workspaces.outline();
		expect([...replayed.order]).toEqual([release, first, notes]);
		expect(replayed.items.get(notes)).toMatchObject({
			text: 'Write the notes',
			note: 'In German too',
			parentId: release,
			done: false
		});
		expect(replayed.items.get(first)?.done).toBe(true);

		workspaces.removeItem(release);
		expect(workspaces.outline().items.size).toBe(0);
	});

	it('gives every workspace an item, under its parent’s', () => {
		const { workspaces, create } = setup();
		const lead = create('Lead');
		const child = workspaces.agents.start(lead, { worktree: 'own', prompt: 'Help' }).id;
		expect(workspaces.outline().items.get(child)).toMatchObject({
			parentId: lead,
			workspace: true
		});
		expect(tree(workspaces)).toEqual([
			['Help', lead],
			['Lead', null]
		]);
	});

	it('lets items between workspaces pass authority through', async () => {
		const { workspaces, create } = setup();
		const lead = create('Lead');
		const { agents } = workspaces;
		const child = agents.start(lead, { worktree: 'own', prompt: 'Help' }).id;
		const folder = workspaces.addItem({ parentId: lead, before: null, text: 'Tests' });
		workspaces.move(child, null, folder);
		expect(workspaces.get(child).parentId).toBe(lead);
		agents.send(lead, child, 'Still yours');

		const waiting = agents.wait(lead, child, 30000);
		workspaces.move(folder, null, null);
		expect(workspaces.get(child).parentId).toBeNull();
		expect(await waiting).toMatchObject({ movedAway: true });
		expect(() => agents.send(lead, child, 'Mine?')).toThrow();
		expect(() => workspaces.move(folder, null, child)).toThrow(refusal(/under itself/));
		expect(() => workspaces.removeItem(folder)).toThrow(refusal(/archived, not removed/));
	});

	it('starts a workspace on an item written down earlier', () => {
		const { workspaces, repo, create } = setup();
		const lead = create('Lead');
		const todo = workspaces.addItem({
			parentId: lead,
			before: null,
			text: 'Check the error paths'
		});
		const id = workspaces.create({
			repoId: repo.id,
			agent: 'claude',
			prompt: 'Look at every error path',
			itemId: todo
		});
		expect(id).toBe(todo);
		expect(workspaces.get(id)).toMatchObject({
			title: 'Check the error paths',
			manuallyNamed: true,
			parentId: lead
		});
		expect(() =>
			workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Again', itemId: todo })
		).toThrow(refusal(/has a workspace already/));
		// the item's text is the workspace's name
		workspaces.editItem(id, { text: 'Check every error path' });
		expect(workspaces.get(id).title).toBe('Check every error path');
		expect(() => workspaces.completeItem(id, true)).toThrow(refusal(/Archive/));
	});

	it('takes a workspace’s items along when it is purged', () => {
		const { workspaces, create } = setup();
		const id = create('Done soon');
		const todo = workspaces.addItem({ parentId: id, before: null, text: 'A detail' });
		workspaces.record(id, { kind: 'turn.completed' });
		workspaces.archive(id);
		workspaces.purge([id]);
		expect(workspaces.outline().items.has(id)).toBe(false);
		expect(workspaces.outline().items.has(todo)).toBe(false);
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
			transcript: [{ kind: 'user' }, { kind: 'text', text: 'Done.' }, { kind: 'turn' }]
		});
		expect(() => workspaces.send(id, 'More')).toThrow();
		expect(createWorkspaces(store, repos, dispatch).get(id).archivedAt).not.toBeNull();
	});

	it('gives a held workspace nothing to do, and starts no agent in its worktree, until released', () => {
		const { workspaces, create } = setup();
		const id = create('Lead');
		workspaces.record(id, { kind: 'turn.completed' });
		const release = workspaces.hold([id], 'being archived');
		expect(() => workspaces.send(id, 'More')).toThrow(refusal(/being archived/));
		expect(() => workspaces.steer(id, 'More')).toThrow(refusal(/being archived/));
		expect(() => workspaces.join(id)).toThrow(refusal(/being archived/));
		expect(() => workspaces.hold([id], 'moving to a new branch')).toThrow();
		release();
		expect(workspaces.summary(workspaces.join(id)).worktreeId).toBe(id);
	});

	it('continues the saved session and replays each restored transcript exactly once', () => {
		const { store, repos, workspaces, create, dispatch, sent } = setup();
		const id = create('First');
		workspaces.record(id, { kind: 'resume', id: 'saved-session' });
		workspaces.record(id, { kind: 'turn.completed' });
		for (const message of ['Second', 'Third']) {
			const history = workspaces.get(id).transcript;
			workspaces.archive(id);
			expect(workspaces.archived().map((entry) => entry.id)).toEqual([id]);
			workspaces.restore(id);
			workspaces.restore(id);
			expect(workspaces.archived()).toEqual([]);
			expect(workspaces.get(id).transcript).toEqual(history);
			workspaces.send(id, message);
			expect(sent.at(-1)).toMatchObject({ resumeId: 'saved-session' });
			workspaces.record(id, { kind: 'turn.completed' });
		}
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.get(id)).toEqual(workspaces.get(id));
		expect(
			replay
				.get(id)
				.transcript.filter((item) => item.kind === 'user')
				.map((item) => item.text)
		).toEqual(['First', 'Second', 'Third']);
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
	const worktree = { kind: 'worktree', path: '/wt', branch: 'geordi/parent' } as const;

	function lead(options?: Parameters<typeof setup>[0]) {
		const context = setup(options);
		const id = context.create('Lead');
		context.workspaces.record(id, worktree);
		return { ...context, lead: id, agents: context.workspaces.agents };
	}

	it('returns a child request to its waiting parent and delivers the answer in the same turn', async () => {
		const { agents, workspaces, lead: parent, sent, create } = lead();
		const child = agents.start(parent, { worktree: 'own', prompt: 'Test' });
		const other = create('Peer');
		const questions = [
			{
				question: 'Which database?',
				options: [{ label: 'SQLite (Recommended)' }, { label: 'Memory' }],
				multiSelect: false
			}
		];
		const request = { kind: 'question' as const, id: 'choice', questions };
		const waiting = agents.wait(parent, child.id, 30000);
		workspaces.record(child.id, { ...request, questions });
		expect(await waiting).toMatchObject({
			status: 'running',
			parentQuestions: [{ id: 'choice', questions }]
		});
		expect(workspaces.get(parent).queue).toEqual([]);
		expect(workspaces.get(child.id).asking).toBe(false);
		expect(() => agents.answerQuestion(other, child.id, 'choice', ['No'])).toThrow();
		expect(() => agents.forwardQuestion(other, child.id, 'choice')).toThrow();
		expect(() => agents.answerQuestion(parent, child.id, 'choice', [])).toThrow();
		agents.answerQuestion(parent, child.id, 'choice', ['SQLite']);
		agents.answerQuestion(parent, child.id, 'choice', ['SQLite']);
		expect(sent.filter((m) => m.type === 'agent.answer')).toEqual([
			{
				type: 'agent.answer',
				workspaceId: child.id,
				questionId: 'choice',
				answers: ['SQLite (Recommended)']
			}
		]);
		expect(() => agents.forwardQuestion(parent, child.id, 'choice')).toThrow();
		workspaces.steer(child.id, 'A task from the person');
		agents.send(parent, child.id, 'Any news?');
		workspaces.record(child.id, { ...request, id: 'personal', questions });
		expect(workspaces.get(child.id).asking).toBe(true);
		expect(() => agents.answerQuestion(parent, child.id, 'personal', ['No'])).toThrow();
	});

	it('forwards the original forms independently and replays their routes after a restart', async () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-child-questions-')), 'events.db');
		const { agents, workspaces, lead: parent, sent } = lead({ database });
		const children = ['Tests', 'Fixtures'].map(
			(prompt) => agents.start(parent, { prompt, worktree: 'own' }).id
		);
		const questions = [{ question: 'Use the small sample?', options: [], multiSelect: false }];
		for (const id of children) {
			workspaces.record(id, { kind: 'question', id: 'q', questions });
			expect(await agents.wait(parent, id, 30000)).toHaveProperty('parentQuestions');
			agents.forwardQuestion(parent, id, 'q');
			agents.forwardQuestion(parent, id, 'q');
			expect(() => agents.answerQuestion(parent, id, 'q', ['Yes'])).toThrow();
		}
		workspaces.record(parent, { kind: 'turn.completed' });
		expect(workspaces.get(parent).queue).toEqual([]);
		expect(
			workspaces
				.get(parent)
				.transcript.some(
					(item) => item.kind === 'user' && item.text.includes(questions[0].question)
				)
		).toBe(false);
		const store = new EventStore<GeordiEvent>(database);
		const replay = createWorkspaces(
			store,
			createRepos(store),
			(message) => (sent.push(message), true)
		);
		expect(
			replay
				.forwardedQuestions(parent)
				.map((q) => q.workspaceId)
				.sort()
		).toEqual([...children].sort());
		replay.answer(children[0], 'q', ['Yes']);
		expect(sent.at(-1)).toEqual({
			type: 'agent.answer',
			workspaceId: children[0],
			questionId: 'q',
			answers: ['Yes']
		});
		expect(replay.forwardedQuestions(parent)).toHaveLength(1);
		replay.record(children[1], { kind: 'question.closed', id: 'q' });
		expect(replay.forwardedQuestions(parent)).toEqual([]);
	});

	it('alerts the parent waiting on another child without changing which agent it reports', async () => {
		const { agents, workspaces, lead: parent } = lead();
		const first = agents.start(parent, { worktree: 'own', prompt: 'First' }).id;
		const second = agents.start(parent, { worktree: 'own', prompt: 'Second' }).id;
		const waited = agents.wait(parent, first, 30000);
		workspaces.record(second, {
			kind: 'question',
			id: 'q',
			questions: [{ question: 'Continue?', options: [], multiSelect: false }]
		});
		expect(await waited).toMatchObject({ id: first, childrenAsking: [second] });
		expect(await agents.wait(parent, first, 30000)).toMatchObject({
			id: first,
			childrenAsking: [second]
		});
		expect(workspaces.get(parent).queue).toEqual([]);
	});

	it('wakes an idle parent once without copying the request into its chat', () => {
		const { agents, workspaces, lead: parent, sent } = lead();
		const child = agents.start(parent, { worktree: 'own', prompt: 'Test' });
		workspaces.record(parent, { kind: 'turn.completed' });
		const count = sent.length;
		const request = {
			kind: 'question' as const,
			id: 'q',
			questions: [{ question: 'Which database?', options: [], multiSelect: false }]
		};
		workspaces.record(child.id, request);
		workspaces.record(child.id, request);
		expect(sent.slice(count)).toMatchObject([{ type: 'agent.message', workspaceId: parent }]);
		expect(JSON.stringify(sent.slice(count))).not.toContain('Which database?');
		workspaces.record(parent, { kind: 'turn.completed' });
		expect(sent).toHaveLength(count + 1);
	});
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

	it('starts a child that works in its own worktree, branched from where it is told', () => {
		const { workspaces, agents, sent, repo, lead: caller } = lead();
		const child = agents.start(caller, {
			worktree: 'own',
			base: 'geordi/parent',
			agent: 'codex',
			prompt: 'Build it'
		});

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

	it('reports the last thing a child said in its latest turn', async () => {
		const { workspaces, agents, lead: caller } = lead();
		const { id } = agents.start(caller, { worktree: 'shared', prompt: 'Go' });
		workspaces.record(id, { kind: 'text', text: 'Looking.' });

		const waiting = agents.wait(id, id, 5000);
		workspaces.record(id, { kind: 'text', text: 'Done.' });
		workspaces.record(id, { kind: 'turn.completed' });
		expect(await waiting).toMatchObject({
			status: 'idle',
			reply: 'Done.',
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
	function family(agent: Agent = 'claude') {
		const { workspaces, create, sent, store, repos, dispatch } = setup();
		const lead = create('Lead', agent);
		workspaces.record(lead, { kind: 'worktree', path: '/wt', branch: 'geordi/lead' });
		const child = workspaces.agents.start(lead, { worktree: 'own', prompt: 'Build' }).id;
		const said = () =>
			workspaces
				.get(child)
				.transcript.flatMap((item) => (item.kind === 'user' ? [[item.text, item.from]] : []));
		return { workspaces, lead, child, said, sent, store, repos, dispatch };
	}

	it('has a message to a working agent wait for its turn to end, and marks whose it is', () => {
		const { workspaces, lead, child, said } = family();
		workspaces.agents.send(lead, child, 'Also update the docs', false);
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

	it('tells a parent when its agent ends a turn, with what it said', async () => {
		const { workspaces, lead, child } = family();
		const parentSaid = () =>
			workspaces
				.get(lead)
				.transcript.flatMap((item) => (item.kind === 'user' ? [[item.text, item.from]] : []));

		// a parent at work hears it during its current turn
		workspaces.record(child, { kind: 'text', text: 'Built it.' });
		workspaces.agents.send(lead, child, 'Any news?');
		workspaces.record(child, { kind: 'turn.completed' });
		const notice = `Your agent “Build” (${child}) finished its turn.\n\nBuilt it.`;
		expect(workspaces.get(lead).queue).toEqual([]);
		expect(workspaces.get(lead).status).toBe('running');
		expect(parentSaid().at(-1)).toEqual([notice, child]);

		// an idle parent is woken by a failure too
		workspaces.record(lead, { kind: 'turn.completed' });
		workspaces.agents.send(lead, child, 'Again');
		workspaces.record(child, { kind: 'turn.failed', error: 'boom' });
		expect(parentSaid().at(-1)).toEqual([`Your agent “Build” (${child}) stopped: boom`, child]);

		// a parent waiting for it hears it from the wait alone
		workspaces.record(lead, { kind: 'turn.completed' });
		workspaces.agents.send(lead, child, 'Once more');
		const waited = workspaces.agents.wait(lead, child, 5000);
		workspaces.record(child, { kind: 'turn.completed' });
		expect(await waited).toMatchObject({ status: 'idle' });
		expect(workspaces.get(lead)).toMatchObject({ status: 'idle', queue: [] });

		// what a person talks over with it is theirs
		const before = parentSaid().length;
		workspaces.send(child, 'Rename that');
		workspaces.record(child, { kind: 'turn.completed' });
		expect(workspaces.get(lead).status).toBe('idle');

		// news goes up a chain: a turn begun by its own agent's report is reported on
		workspaces.agents.send(lead, child, 'Delegate');
		workspaces.record(child, { kind: 'worktree', path: '/wt/child', branch: 'geordi/child' });
		const grandchild = workspaces.agents.start(child, { worktree: 'shared', prompt: 'Part' }).id;
		workspaces.record(child, { kind: 'turn.completed' });
		workspaces.record(lead, { kind: 'turn.completed' });
		workspaces.record(grandchild, { kind: 'turn.completed' });
		expect(workspaces.get(child).status).toBe('running');
		workspaces.record(child, { kind: 'text', text: 'All parts done.' });
		workspaces.record(child, { kind: 'turn.completed' });
		expect(
			parentSaid()
				.slice(before)
				.map(([, from]) => from)
		).toEqual([child, child]);
		expect(parentSaid().at(-1)?.[0]).toMatch(/All parts done\.$/);

		// a long answer keeps its conclusion, not its start
		workspaces.record(lead, { kind: 'turn.completed' });
		workspaces.agents.send(lead, child, 'Write it up');
		workspaces.record(child, { kind: 'text', text: 'Looking into it.' });
		workspaces.record(child, { kind: 'text', text: `${'x'.repeat(5000)} In short: yes.` });
		workspaces.record(child, { kind: 'turn.completed' });
		const long = parentSaid().at(-1)?.[0] ?? '';
		expect(long).toMatch(/begins earlier; see read_workspace/);
		expect(long).toMatch(/In short: yes\.$/);
		expect(long).not.toMatch(/Looking into it/);
	});

	it.each([false, true])(
		'reports the delegated turn before a personal follow-up (wait=%s)',
		async (wait) => {
			const { workspaces, lead, child } = family();
			const result = wait && workspaces.agents.wait(lead, child, 5000);
			workspaces.send(child, 'My follow-up');
			workspaces.record(child, { kind: 'text', text: 'Build result' });
			workspaces.record(child, { kind: 'turn.completed' });
			expect(workspaces.get(child).status).toBe('running');
			workspaces.record(child, { kind: 'text', text: 'Personal reply' });
			workspaces.record(child, { kind: 'turn.completed' });
			if (result) expect(await result).toMatchObject({ status: 'idle', reply: 'Build result' });
			const notices = workspaces
				.get(lead)
				.transcript.flatMap((item) =>
					item.kind === 'user' && item.from === child ? [item.text] : []
				);
			expect(workspaces.get(lead).queue).toEqual([]);
			expect(notices).toEqual(
				wait ? [] : [`Your agent “Build” (${child}) finished its turn.\n\nBuild result`]
			);
		}
	);

	it.each([false, true])(
		'resumes a completed turn after archive failure (parent waiting=%s)',
		async (waiting) => {
			const { workspaces, lead, child, said } = family();
			const result = waiting && workspaces.agents.wait(lead, child, 5000);
			workspaces.send(child, 'My follow-up');
			const release = workspaces.hold([lead, child], 'being removed', [lead, child]);
			workspaces.record(child, { kind: 'text', text: 'Build result' });
			workspaces.record(child, { kind: 'turn.completed' });
			expect(workspaces.get(child).queue).toEqual(['My follow-up']);
			const notices = () =>
				workspaces
					.get(lead)
					.transcript.flatMap((item) =>
						item.kind === 'user' && item.from === child ? [item.text] : []
					);
			expect(notices()).toEqual([]);
			release();
			if (result) expect(await result).toMatchObject({ reply: 'Build result' });
			const retry = workspaces.hold([child], 'being removed', [child]);
			retry();
			expect(notices()).toEqual(
				waiting ? [] : [`Your agent “Build” (${child}) finished its turn.\n\nBuild result`]
			);
			expect(said()).toEqual([
				['Build', lead],
				['My follow-up', undefined]
			]);
		}
	);

	it('tells a working agent at once what a message that interrupts says', () => {
		const { workspaces, lead, child, said, sent } = family();
		workspaces.agents.send(lead, child, 'Stop: wrong directory');
		expect(sent.at(-1)).toMatchObject({
			type: 'agent.message',
			workspaceId: child,
			prompt: 'Stop: wrong directory'
		});
		expect(workspaces.get(child)).toMatchObject({ status: 'running', lastTurn: null });
		expect(said().at(-1)).toEqual(['Stop: wrong directory', lead]);
	});

	it('queues a child report for a busy OpenCode parent across a forge restart', () => {
		const { workspaces, lead, child, store, repos, dispatch } = family('opencode');
		workspaces.record(child, { kind: 'turn.failed', error: 'Build failed' });
		const replay = createWorkspaces(store, repos, dispatch);
		expect(replay.get(lead).queue).toEqual([`Your agent “Build” (${child}) stopped: Build failed`]);
		replay.record(lead, { kind: 'turn.completed' });
		expect(replay.get(lead).transcript.at(-1)).toMatchObject({
			from: child,
			text: expect.stringContaining('Build failed')
		});
		expect(replay.get(lead).queue).toEqual([]);
	});

	it('keeps a personal exchange private when a child receives steering', () => {
		const { workspaces, lead, child } = family();
		workspaces.steer(child, 'Review my private changes');
		workspaces.agents.send(lead, child, 'Any news?');
		workspaces.record(child, { kind: 'text', text: 'Personal reply' });
		workspaces.record(child, { kind: 'turn.completed' });
		expect(workspaces.get(lead).transcript.at(-1)).toMatchObject({ text: 'Lead' });
		expect(workspaces.get(lead).queue).toEqual([]);
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
				{ kind: 'turn' },
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

	it('isolates missing attachments during reconnect and keeps a live turn working', () => {
		const { store, repos, workspaces, create, sent, dispatch } = setup();
		const absent = create('');
		const working = create('Already working');
		acknowledgePrompt(workspaces, sent.at(-1));
		for (const id of [absent, working])
			store.append({
				type: 'workspace.message',
				stream: `workspace:${id}`,
				data: { id, text: 'Look', images: ['missing'], deliveryId: 'missing-picture' }
			});
		const healthy = create('Run');
		const resumed = createWorkspaces(store, repos, dispatch);
		resumed.reconcile([working]);
		expect(resumed.get(absent).lastTurn).toBe('failed');
		expect(resumed.get(working).status).toBe('running');
		expect(resumed.get(working).transcript.at(-1)).toMatchObject({ kind: 'error' });
		expect(sent.at(-1)).toMatchObject({ workspaceId: healthy, prompt: 'Run' });
		expect(
			createWorkspaces(store, repos, dispatch).summary(working).pendingDelivery
		).toBeUndefined();
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

describe('projects (FDR-012)', () => {
	const setupProject = () => {
		const context = setup();
		const project = context.workspaces.create({ repoId: null, agent: 'claude', prompt: 'Lead' });
		return { ...context, project };
	};
	const messageTo = (sent: ForgeMessage[], id: string) =>
		sent.findLast(
			(message): message is Extract<ForgeMessage, { type: 'agent.message' }> =>
				message.type === 'agent.message' && message.workspaceId === id
		);

	it('belong to no repository, and are told to work in a folder of their own', () => {
		const { workspaces, sent, project } = setupProject();
		expect(workspaces.get(project).repoId).toBeNull();
		const message = messageTo(sent, project)!;
		expect(message).toMatchObject({ worktreeId: project, project: true });
		expect(message).not.toHaveProperty('repoPath');
		expect(message.instructions).toContain('Geordi project');
		expect(() => workspaces.ref(project)).toThrow();
		expect(workspaces.locate(project)).toEqual({ worktreeId: project, project: true });
	});

	it('start agents in any repository they name, as their parent', () => {
		const { workspaces, repo, project } = setupProject();
		const refusal = (start: () => unknown) => {
			try {
				start();
			} catch (error) {
				return (error as { body: { message: string } }).body.message;
			}
		};
		expect(
			refusal(() => workspaces.agents.start(project, { worktree: 'own', prompt: 'Build' }))
		).toMatch(/Say which repository/);
		const { id } = workspaces.agents.start(project, {
			repository: repo.id,
			worktree: 'own',
			prompt: 'Build'
		});
		expect(workspaces.get(id)).toMatchObject({ repoId: repo.id, parentId: project, base: null });
	});

	it('is out of reach of a token for chosen repositories, as it is in none', () => {
		const { workspaces, repo, project } = setupProject();
		const token = workspaces.access.issue('Scoped', [repo.id]);
		const client = workspaces.agents.authenticate(token)!;
		expect(workspaces.agents.listWorkspaces(client, false).map((w) => w.id)).not.toContain(project);
		expect(workspaces.agents.listWorkspaces(project, false).map((w) => w.id)).toContain(project);
	});

	it('start agents alongside the agent of a workspace in a repository, or in themselves', () => {
		const { workspaces, sent, create, repo, project } = setupProject();
		const target = create('Someone else’s work');
		const { id: reviewer } = workspaces.agents.start(project, {
			worktree: 'own',
			workspace: target,
			prompt: 'Review'
		});
		expect(workspaces.get(reviewer)).toMatchObject({
			repoId: repo.id,
			worktreeId: target,
			parentId: project
		});
		const { id: helper } = workspaces.agents.start(project, { worktree: 'shared', prompt: 'Help' });
		expect(workspaces.get(helper)).toMatchObject({ repoId: null, worktreeId: project });
		expect(messageTo(sent, helper)).toMatchObject({ worktreeId: project, project: true });
		// a person can add a conversation to a project too
		expect(workspaces.get(workspaces.join(project)).worktreeId).toBe(project);
		// what works in it goes with it; what it started in a repository stays
		expect(workspaces.descendants(project).sort()).toEqual(
			workspaces
				.sharing(project)
				.map((w) => w.id)
				.filter((id) => id !== project)
				.sort()
		);
		// a repository agent can only place a reviewer with a descendant
		const lead = create('Lead in a repository');
		expect(() =>
			workspaces.agents.start(lead, { worktree: 'own', workspace: target, prompt: 'No' })
		).toThrow();
		// or with itself, as with a shared worktree
		const { id: own } = workspaces.agents.start(lead, {
			worktree: 'own',
			workspace: lead,
			prompt: 'Review mine'
		});
		expect(workspaces.get(own)).toMatchObject({ worktreeId: lead, parentId: lead });
	});

	it('leave other projects alone, and are left alone by them', () => {
		const { workspaces, project } = setupProject();
		const other = workspaces.create({ repoId: null, agent: 'claude', prompt: 'Other' });
		expect(() => workspaces.agents.get(project, other)).toThrow();
		expect(() => workspaces.agents.stop(project, other)).toThrow();
		expect(() => workspaces.agents.send(project, other, 'Hi')).toThrow();
		expect(() => workspaces.agents.readWorkspace(project, other)).toThrow();
		expect(() =>
			workspaces.agents.start(project, { worktree: 'own', workspace: other, prompt: 'No' })
		).toThrow();
		const seen = workspaces.agents.listWorkspaces(project, false).map((w) => w.id);
		expect(seen).toContain(project);
		expect(seen).not.toContain(other);
	});

	it('supervise any agent, whoever started it', () => {
		const { workspaces, sent, create, project } = setupProject();
		const other = create('Someone else’s work');
		expect(workspaces.agents.get(project, other).id).toBe(other);
		workspaces.agents.send(project, other, 'Change of plan', true);
		expect(messageTo(sent, other)?.prompt).toBe('Change of plan');
		workspaces.agents.stop(project, other);
		expect(sent.at(-1)).toEqual({ type: 'agent.stop', workspaceId: other });
	});
});

describe('purging archived workspaces', () => {
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
		'base64'
	);
	const worktree = { kind: 'worktree', path: '/wt', branch: 'geordi/lead' } as const;
	const done = (workspaces: ReturnType<typeof createWorkspaces>, ...ids: string[]) =>
		// until all are idle: a parent is woken by what its agents report
		{
			while (ids.some((id) => workspaces.get(id).status === 'running'))
				ids.forEach((id) => workspaces.record(id, { kind: 'turn.completed' }));
		};

	it('deletes a workspace with the agents it started and those alongside, and nothing else', () => {
		const { store, repos, workspaces, create, dispatch } = setup();
		const lead = create('Lead');
		workspaces.record(lead, worktree);
		const child = workspaces.agents.start(lead, { worktree: 'own', prompt: 'Help' }).id;
		const aide = workspaces.join(lead);
		const other = create('Other');
		done(workspaces, lead, child, other);
		for (const id of [lead, child, aide]) workspaces.archive(id);

		const { purged, freed } = workspaces.purge([lead]);
		expect(purged).toBe(3);
		expect(freed).toBeGreaterThanOrEqual(0);
		for (const id of [lead, child, aide]) expect(() => workspaces.get(id)).toThrow();
		expect(workspaces.archived()).toEqual([]);
		expect(store.readAll().filter((event) => event.stream === `workspace:${lead}`)).toEqual([]);

		const replay = createWorkspaces(store, repos, dispatch);
		expect(() => replay.get(lead)).toThrow();
		expect(replay.get(other)).toEqual(workspaces.get(other));
	});

	it('refuses while one of them is not archived, and deletes nothing', () => {
		const { store, workspaces, create } = setup();
		const lead = create('Lead');
		workspaces.record(lead, worktree);
		workspaces.agents.start(lead, { worktree: 'own', prompt: 'Help' });
		done(workspaces, lead);
		workspaces.archive(lead);
		const before = store.readAll().length;
		expect(() => workspaces.purge([lead])).toThrow(refusal(/“Help” is not archived/));
		expect(store.readAll()).toHaveLength(before);
		const release = workspaces.hold([lead], 'being restored');
		expect(() => workspaces.purge([lead])).toThrow();
		release();
	});

	it('keeps what a purged agent said elsewhere as its own, and where a worktree is', () => {
		const { store, repos, workspaces, create, dispatch } = setup();
		const project = workspaces.create({ repoId: null, agent: 'claude', prompt: 'Plan' });
		const owner = create('Owner');
		done(workspaces, owner);
		workspaces.agents.send(project, owner, 'Change of plan');
		// an agent alongside said where the owner's worktree is
		const aide = workspaces.join(owner);
		workspaces.record(aide, { kind: 'worktree', path: '/owner', branch: 'geordi/owner' });
		done(workspaces, project, owner);
		workspaces.archive(project);
		workspaces.archive(aide);

		workspaces.purge([project]);
		workspaces.purge([aide]);
		const kept = workspaces.get(owner);
		expect(kept.transcript.find((item) => item.kind === 'user' && item.from)).toMatchObject({
			text: 'Change of plan',
			from: project
		});
		expect(kept.worktree).toEqual({ path: '/owner', branch: 'geordi/owner' });
		expect(createWorkspaces(store, repos, dispatch).get(owner)).toEqual(kept);
	});

	it('keeps queued child messages identifiable after purge and replay', async () => {
		const { store, repos, dispatch, create, workspaces } = setup();
		const parent = create('Parent');
		const { id } = workspaces.agents.start(parent, {
			worktree: 'own',
			prompt: 'Review',
			model: 'sonnet',
			effort: 'high'
		});
		workspaces.configure(id, { model: 'opus', effort: 'low' });
		workspaces.agents.send(id, parent, 'One more finding', false);
		const waiting = workspaces.agents.wait(parent, id, 5000);
		done(workspaces, id);
		workspaces.archive(id);
		workspaces.purge([id]);
		const restarted = createWorkspaces(store, repos, dispatch);
		const replay = restarted.get(parent);
		const details = { agent: 'claude', model: 'sonnet', effort: 'high' };
		expect(replay.sentBy.details).toEqual([details]);
		expect(replay.queue).toEqual(['One more finding']);
		expect(replay.childSenders).toEqual({ [id]: 'Review' });
		restarted.record(parent, { kind: 'turn.completed' });
		expect(restarted.get(parent).transcript.at(-1)).toMatchObject({
			text: 'One more finding',
			senderDetails: details
		});
		await waiting;
	});

	it('deletes the images sent to it, and keeps the bytes another image has too', () => {
		const { store, workspaces, repo } = setup();
		const images = createImages(store);
		const gone = images.add(png);
		const kept = images.add(png);
		const purged = workspaces.create({
			repoId: repo.id,
			agent: 'claude',
			prompt: 'A',
			images: [gone]
		});
		workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'B', images: [kept] });
		done(workspaces, purged);
		workspaces.archive(purged);
		workspaces.purge([purged]);
		expect(() => images.get(gone)).toThrow();
		expect(images.get(kept).data).toBe(png.toString('base64'));
	});

	it('purges queued and withdrawn attachments after restart, preserving other workspaces’ images', () => {
		const { store, workspaces, create, repos, dispatch } = setup();
		const images = createImages(store);
		const withdrawn = images.add(png);
		const queued = images.add(png);
		const shared = images.add(png);
		const kept = create('Keep');
		workspaces.send(kept, 'Still queued', null, [shared]);
		const id = create('Work');
		workspaces.send(id, 'Withdraw', null, [withdrawn]);
		workspaces.dequeue(id, 0, 'Withdraw');
		workspaces.send(id, 'Next', null, [queued, shared]);
		workspaces.record(id, { kind: 'turn.failed', error: 'Stopped' });
		workspaces.archive(id);
		createWorkspaces(store, repos, dispatch).purge([id]);
		expect(() => images.get(queued)).toThrow();
		expect(() => images.get(withdrawn)).toThrow();
		expect(images.get(shared).data).toBe(png.toString('base64'));
	});

	it('keeps the files of the images it deletes with the copy of the log it leaves', () => {
		const database = join(mkdtempSync(join(tmpdir(), 'geordi-purge-')), 'events.db');
		const { store, workspaces, repo } = setup({ database });
		const images = createImages(store);
		const image = images.add(png);
		const id = workspaces.create({
			repoId: repo.id,
			agent: 'claude',
			prompt: 'A',
			images: [image]
		});
		done(workspaces, id);
		workspaces.archive(id);
		const [blob] = store
			.readStream(`image:${image}`)
			.flatMap((event) =>
				event.type === 'image.added' && 'blob' in event.data ? [event.data.blob] : []
			);
		workspaces.purge([id]);
		const [copy] = readdirSync(store.purgeCopies!);
		expect(existsSync(join(store.purgeCopies!, copy, 'events.db'))).toBe(true);
		expect(existsSync(join(store.purgeCopies!, copy, 'blobs', blob))).toBe(true);
		expect(existsSync(join(store.path, '..', 'blobs', blob))).toBe(false);
		store.close();
	});

	it('can be undone by hand, as FDR-014 says, from the copy of the last purge', () => {
		const directory = mkdtempSync(join(tmpdir(), 'geordi-purge-'));
		const { store, workspaces, repos, repo, dispatch } = setup({
			database: join(directory, 'events.db')
		});
		const image = createImages(store).add(png);
		const id = workspaces.create({
			repoId: repo.id,
			agent: 'claude',
			prompt: 'A',
			images: [image]
		});
		done(workspaces, id);
		workspaces.archive(id);
		const before = workspaces.get(id);
		workspaces.purge([id]);
		// work done after the deletion, still in the write-ahead log when Geordi stops
		const picture = createImages(store).add(png);
		const later = workspaces.create({
			repoId: repo.id,
			agent: 'claude',
			prompt: 'Later',
			images: [picture]
		});
		void repos;

		// the data as a crash leaves it, write-ahead log and all
		const data = mkdtempSync(join(tmpdir(), 'geordi-undo-'));
		cpSync(directory, data, { recursive: true });
		store.close();
		expect(existsSync(join(data, 'events.db-wal'))).toBe(true);

		// 2. set the current data aside; 3. move the copy in; 4. move the images back
		const aside = mkdtempSync(join(tmpdir(), 'geordi-aside-'));
		for (const file of ['events.db', 'events.db-wal', 'events.db-shm'])
			if (existsSync(join(data, file))) renameSync(join(data, file), join(aside, file));
		cpSync(join(data, 'blobs'), join(aside, 'blobs'), { recursive: true });
		// what else may be there: a deletion that never went through, and a folder of someone's own
		mkdirSync(join(data, 'purge-copies', 'pending-2999-01-01T00-00-00.000Z-0123abcd'));
		mkdirSync(join(data, 'purge-copies', 'saved'));
		// 3. the newest folder named by a time alone
		const copy = join(
			data,
			'purge-copies',
			readdirSync(join(data, 'purge-copies'))
				.filter((folder) => /^\d{4}-\d{2}-\d{2}T[\d.-]+Z-[0-9a-f]{8}$/.test(folder))
				.sort()
				.at(-1)!
		);
		renameSync(join(copy, 'events.db'), join(data, 'events.db'));
		for (const blob of readdirSync(join(copy, 'blobs')))
			renameSync(join(copy, 'blobs', blob), join(data, 'blobs', blob));

		const restored = new EventStore<GeordiEvent>(join(data, 'events.db'));
		const back = createWorkspaces(restored, createRepos(restored), dispatch);
		expect(back.get(id)).toEqual(before);
		expect(createImages(restored).get(image).data).toBe(png.toString('base64'));
		// what happened since is not in it, as the warning says, but in what was set aside
		expect(() => back.get(later)).toThrow();
		expect(statSync(join(data, 'events.db')).mode & 0o777).toBe(0o600);
		restored.close();
		const kept = new EventStore<GeordiEvent>(join(aside, 'events.db'));
		expect(createWorkspaces(kept, createRepos(kept), dispatch).get(later).title).toBe('Later');
		expect(createImages(kept).get(picture).data).toBe(png.toString('base64'));
		kept.close();
	});
});
