import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createArchiver } from './archive.ts';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRepos } from './repos.ts';
import { createWorkspaces } from './workspaces.ts';

function setup() {
	const repoPath = mkdtempSync(join(tmpdir(), 'geordi-repo-'));
	execFileSync('git', ['init', '-q', repoPath]);
	const store = new EventStore<GeordiEvent>(':memory:');
	const repos = createRepos(store);
	const workspaces = createWorkspaces(store, repos, () => true);
	const repo = repos.register(repoPath);

	/** Worktrees a daemon was asked to remove, and ones it refuses to (they have work in them). */
	const removed: string[] = [];
	const dirty = new Set<string>();
	const closed: string[] = [];
	/** The worktrees whose teardown script was to run. */
	const tornDown: string[] = [];
	/** The desks whose folders were to go. */
	const desksRemoved: string[] = [];
	const archive = createArchiver({
		workspaces,
		closeTerminals: (id) => closed.push(id),
		removeWorktree: async ({ worktreeId }, discard, teardown) => {
			if (dirty.has(worktreeId) && !discard)
				throw new Error('The worktree has uncommitted or untracked files.');
			removed.push(worktreeId);
			if (teardown) tornDown.push(worktreeId);
		},
		removeDesk: async (id) => void desksRemoved.push(id)
	});

	/** A workspace whose agent has a worktree and is idle. */
	const settle = (id: string) => {
		workspaces.record(id, { kind: 'worktree', path: `/wt/${id}`, branch: `geordi/${id}` });
		workspaces.record(id, { kind: 'turn.completed' });
		return id;
	};
	const lead = settle(workspaces.create({ repoId: repo.id, agent: 'claude', prompt: 'Lead' }));
	const start = (parent: string, worktree: 'own' | 'shared', prompt: string) => {
		workspaces.send(parent, 'Delegate'); // only a working agent can start others
		const { id } = workspaces.agents.start(parent, { worktree, prompt });
		workspaces.record(parent, { kind: 'turn.completed' });
		return settle(id);
	};
	return {
		workspaces,
		repo,
		archive,
		removed,
		dirty,
		closed,
		tornDown,
		desksRemoved,
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

	it('archives nothing while any of them is still working', async () => {
		const { workspaces, repo, archive, lead, start } = setup();
		const child = start(lead, 'own', 'Build');
		workspaces.send(child, 'More');

		await expect(archive(lead, false)).rejects.toEqual(refusal(/Stop the agent in “Build”/));
		expect(workspaces.list(repo.id)).toHaveLength(2);
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

	it('archives a desk alone, with its folder: what it started carries on', async () => {
		const { workspaces, repo, archive, removed, desksRemoved } = setup();
		const desk = workspaces.create({ repoId: null, agent: 'claude', prompt: 'Orchestrate' });
		workspaces.record(desk, { kind: 'turn.started' });
		const { id: child } = workspaces.agents.start(desk, {
			repository: repo.id,
			worktree: 'own',
			prompt: 'Build'
		});
		workspaces.record(desk, { kind: 'turn.completed' });

		await archive(desk, false);

		expect(desksRemoved).toEqual([desk]);
		expect(removed).toEqual([]);
		expect(workspaces.get(desk).archivedAt).not.toBeNull();
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
			removeDesk: async () => {},
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
