import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createArchiver } from './archive.ts';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRepos } from './repos.ts';
import { createWorkspaces } from './workspaces.ts';

function repositoryPath() {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);
	return repoPath;
}

function setup() {
	const store = new EventStore<GeordiEvent>(':memory:');
	const repos = createRepos(store);
	const stops: string[] = [];
	const workspaces = createWorkspaces(store, repos, (message) => {
		if (message.type === 'agent.stop') stops.push(message.workspaceId);
		return true;
	});
	const repo = repos.register(repositoryPath());

	/** Worktrees a daemon was asked to remove, and ones it refuses to (they have work in them). */
	const removed: string[] = [];
	const dirty = new Set<string>();
	const closed: string[] = [];
	/** The worktrees whose teardown script was to run. */
	const tornDown: string[] = [];
	/** The projects whose folders were to go. */
	const projectsClosed: string[] = [];
	const archive = createArchiver({
		workspaces,
		closeTerminals: (id) => closed.push(id),
		removeWorktree: async ({ worktreeId }, discard, teardown) => {
			if (dirty.has(worktreeId) && !discard)
				throw new Error('The worktree has uncommitted or untracked files.');
			removed.push(worktreeId);
			if (teardown) tornDown.push(worktreeId);
		},
		closeProject: async (id) => void projectsClosed.push(id)
	});

	/** Ends turns until the agent is idle: a parent is woken by what its agents report. */
	const finish = (id: string) => {
		while (workspaces.get(id).status === 'running')
			workspaces.record(id, { kind: 'turn.completed' });
	};
	/** A workspace whose agent has a worktree and is idle. */
	const settle = (id: string) => {
		workspaces.record(id, { kind: 'worktree', path: `/wt/${id}`, branch: `geordi/${id}` });
		finish(id);
		return id;
	};
	const lead = settle(workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Lead' }));
	const start = (parent: string, worktree: 'own' | 'shared', prompt: string) => {
		workspaces.send(parent, 'Delegate'); // only a working agent can start others
		const { id } = workspaces.agents.start(parent, { worktree, prompt });
		settle(id);
		finish(parent);
		return id;
	};
	return {
		stops,
		finish,
		workspaces,
		repos,
		store,
		repo,
		archive,
		removed,
		dirty,
		closed,
		tornDown,
		projectsClosed,
		lead,
		start
	};
}

/** Matches the error a refused request throws, by its message. */
const refusal = (message: RegExp) =>
	expect.objectContaining({
		body: expect.objectContaining({ message: expect.stringMatching(message) })
	});

describe('archiving', () => {
	it('takes the workspaces an agent started along with it', async () => {
		const { workspaces, repo, archive, removed, closed, lead, start } = setup();
		const child = start(lead, 'own', 'Build');
		const grandchild = start(child, 'own', 'Build a part');
		const reviewer = start(lead, 'shared', 'Review');
		const other = workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Unrelated' });

		await archive(lead, false);

		expect(workspaces.list(repo.id).map((workspace) => workspace.id)).toEqual([other]);
		expect([...closed].sort()).toEqual([lead, child, grandchild, reviewer].sort());
		// each worktree once: the lead's only after the reviewer sharing it was archived
		expect([...removed].sort()).toEqual([lead, child, grandchild].sort());
		expect(removed.indexOf(grandchild)).toBeLessThan(removed.indexOf(child));
	});

	it('archives nothing while it or anything archived with it is locked (FDR-015)', async () => {
		const { workspaces, archive, removed, closed, lead, start } = setup();
		const child = start(lead, 'own', 'Build');
		workspaces.lock(child, true);

		await expect(archive(lead, false)).rejects.toEqual(refusal(/“Build” is locked/));
		await expect(archive(child, false)).rejects.toEqual(refusal(/locked/));
		expect(removed).toEqual([]);
		expect(closed).toEqual([]);
		expect(workspaces.get(lead).archivedAt).toBeNull();

		workspaces.lock(child, false);
		await archive(lead, false);
		expect(workspaces.get(child).archivedAt).not.toBeNull();
		expect(() => workspaces.lock(child, true)).toThrow();
	});

	it('locks the workspace an agent works alongside in, not the agent itself', () => {
		const { workspaces, lead, start } = setup();
		const reviewer = start(lead, 'shared', 'Review');
		expect(() => workspaces.lock(reviewer, true)).toThrow();
		expect(workspaces.get(reviewer).locked).toBe(false);
	});

	it('cannot lock a workspace while it is being archived', async () => {
		const { workspaces, lead } = setup();
		const removing = Promise.withResolvers<void>();
		const archive = createArchiver({
			workspaces,
			closeTerminals: () => {},
			removeWorktree: () => removing.promise,
			closeProject: async () => {}
		});
		const archiving = archive(lead, false);
		expect(() => workspaces.lock(lead, true)).toThrow();
		removing.resolve();
		await archiving;
		expect(workspaces.get(lead).archivedAt).not.toBeNull();
		expect(workspaces.get(lead).locked).toBe(false);
	});

	it('keeps reviewers with their worktrees across an A → B → A delegation chain', async () => {
		const { workspaces, repos, store, archive, lead, start, removed, closed } = setup();
		const local = start(lead, 'own', 'Local work');
		const other = repos.register(repositoryPath());
		const { id: child } = workspaces.agents.start(local, {
			repository: other.id,
			worktree: 'own',
			prompt: 'Client'
		});
		const { id: reviewer } = workspaces.agents.start(lead, {
			workspace: child,
			worktree: 'own',
			prompt: 'Review'
		});
		const { id: back } = workspaces.agents.start(child, {
			repository: workspaces.get(lead).repoId!,
			worktree: 'own',
			prompt: 'Check compatibility'
		});
		const { id: backReviewer } = workspaces.agents.start(lead, {
			workspace: back,
			worktree: 'shared',
			prompt: 'Review compatibility'
		});
		await archive(lead, false);
		expect(closed).toEqual([local, lead]);
		expect(removed).toEqual([local, lead]);
		for (const id of [child, reviewer, back, backReviewer]) {
			expect(workspaces.get(id)).toMatchObject({ archivedAt: null, status: 'running' });
		}

		workspaces.record(child, { kind: 'turn.completed' });
		await expect(archive(child, false)).rejects.toEqual(refusal(/Stop the agent/));
		workspaces.record(reviewer, { kind: 'turn.completed' });
		await archive(child, false);
		expect(closed.slice(-2)).toEqual([reviewer, child]);
		const replay = createWorkspaces(store, repos, () => true);
		expect(replay.get(back)).toMatchObject({ archivedAt: null, status: 'running' });
		expect(replay.get(backReviewer)).toMatchObject({
			archivedAt: null,
			status: 'running',
			worktreeId: back
		});
	});

	it('tears down only what a person archives: an agent archiving leaves that to the person', async () => {
		const { archive, tornDown, lead, start } = setup();
		const child = start(lead, 'own', 'Build');
		const other = start(lead, 'own', 'Build more');
		await archive(child, false, lead);
		expect(tornDown).toEqual([]);
		await archive(other, false);
		expect(tornDown).toEqual([other]);
	});

	it('leaves a shared worktree alone while a workspace that stays still works in it', async () => {
		const { workspaces, archive, removed, lead, start } = setup();
		const reviewer = start(lead, 'shared', 'Review');
		await archive(reviewer, false);
		expect(removed).toEqual([]);
		expect(workspaces.get(lead).archivedAt).toBeNull();
	});

	it('archives a shared agent with its parent when both work in the same checkout', async () => {
		const { workspaces, archive, removed, closed, lead, start } = setup();
		const parent = start(lead, 'shared', 'Pair');
		const child = start(parent, 'shared', 'Check tests');

		await archive(parent, false);
		expect(closed).toEqual([child, parent]);
		expect(removed).toEqual([]);
		expect(workspaces.get(lead).archivedAt).toBeNull();
	});

	it('archives nothing while any of them is still working', async () => {
		const { workspaces, repo, archive, lead, start } = setup();
		const child = start(lead, 'own', 'Build');
		workspaces.send(child, 'More');

		await expect(archive(lead, false)).rejects.toEqual(refusal(/Stop the agent in “Build”/));
		expect(workspaces.list(repo.id)).toHaveLength(2);
	});

	it('waits for every confirmed stop before archiving and keeps queued work from starting', async () => {
		const { workspaces, archive, lead, start, stops, closed } = setup();
		const child = start(lead, 'shared', 'Review');
		workspaces.send(lead, 'Continue');
		workspaces.send(child, 'Continue');
		workspaces.send(child, 'Later');
		await expect(archive(lead, false, 'agent', true)).rejects.toEqual(refusal(/Stop the agent/));
		expect(stops).toEqual([]);
		const done = archive(lead, false, null, true);
		expect(stops).toEqual([child, lead]);
		workspaces.record(child, { kind: 'turn.completed' });
		expect(workspaces.get(child).status).toBe('idle');
		expect(closed).toEqual([]);
		workspaces.record(lead, { kind: 'turn.failed', error: 'Stopped' });
		await done;
		expect(closed).toEqual([child, lead]);
	});

	it('releases the workspace for retry if an agent does not stop', async () => {
		const { workspaces, archive, lead, closed, removed } = setup();
		workspaces.send(lead, 'Continue');
		vi.useFakeTimers();
		try {
			const failed = expect(archive(lead, false, null, true)).rejects.toEqual(
				refusal(/still running/)
			);
			await vi.advanceTimersByTimeAsync(30_000);
			await failed;
			expect(closed).toEqual([]);
			expect(removed).toEqual([]);
			workspaces.record(lead, { kind: 'turn.failed', error: 'Stopped' });
			await archive(lead, false);
			expect(closed).toEqual([lead]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('stops at work that would be lost, says where, and carries on when told to discard', async () => {
		const { workspaces, repo, archive, dirty, lead, start } = setup();
		const child = start(lead, 'own', 'Build');
		dirty.add(child);

		await expect(archive(lead, false)).rejects.toEqual(refusal(/“Build”: .*uncommitted/));
		expect(workspaces.list(repo.id)).toHaveLength(2);

		await archive(lead, true);
		expect(workspaces.list(repo.id)).toEqual([]);
	});

	it('archives a project with the agents in it, ending its agents: what it started in a repository carries on', async () => {
		const { workspaces, repo, archive, removed, projectsClosed, finish } = setup();
		const project = workspaces.create({ repoId: null, agent: 'claude', prompt: 'Orchestrate' });
		workspaces.record(project, { kind: 'turn.started' });
		const { id: child } = workspaces.agents.start(project, {
			repository: repo.id,
			worktree: 'own',
			prompt: 'Build'
		});
		const { id: helper } = workspaces.agents.start(project, { worktree: 'shared', prompt: 'Help' });
		workspaces.record(helper, { kind: 'turn.completed' });
		finish(project);

		await archive(helper, false);
		expect(projectsClosed).toEqual([]); // the project still works in its folder
		const again = workspaces.join(project);
		await archive(project, false);

		expect(projectsClosed).toEqual([project]);
		expect(workspaces.get(again).archivedAt).not.toBeNull();
		expect(removed).toEqual([]);
		expect(workspaces.get(project).archivedAt).not.toBeNull();
		expect(workspaces.get(child)).toMatchObject({ archivedAt: null, status: 'running' });
	});

	it('leaves the shells alone when it is refused', async () => {
		const { archive, dirty, closed, lead } = setup();
		dirty.add(lead);
		await expect(archive(lead, false)).rejects.toMatchObject({ status: 422 });
		expect(closed).toEqual([]);
	});

	it('lets nothing start in a workspace while its worktree is being removed', async () => {
		const { workspaces, lead } = setup();
		let sending: unknown;
		const archive = createArchiver({
			workspaces,
			closeTerminals: () => {},
			// while the daemon is at it, someone says something
			closeProject: async () => {},
			removeWorktree: async () => {
				try {
					workspaces.send(lead, 'One more thing');
				} catch (refused) {
					sending = refused;
				}
			}
		});

		await archive(lead, false);
		expect(sending).toEqual(refusal(/being archived/));
		expect(workspaces.get(lead)).toMatchObject({ status: 'idle', queue: [] });
		expect(workspaces.get(lead).archivedAt).not.toBeNull();
	});
});
