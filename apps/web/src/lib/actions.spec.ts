import type { PullRequest, Upstream } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { actionsFor, standingOf } from '@geordi/ui/actions';

const clean = { files: [], uncommitted: 0, unpushed: 0 };
const file = { path: 'a.txt', status: 'modified' as const, added: 1, removed: 0 };

const upstream = (pull: Partial<PullRequest> | null = null, pushed = true): Upstream => ({
	forge: 'github',
	repo: 'acme/widgets',
	repoUrl: null,
	branch: 'geordi/abc',
	pushed,
	createUrl: null,
	pull: pull && {
		number: '42',
		title: 'Add the thing',
		url: null,
		state: 'open',
		draft: false,
		base: 'main',
		checks: { state: 'success', total: 3, failed: 0, url: null },
		review: null,
		...pull
	}
});

const ids = (...args: Parameters<typeof actionsFor>) => actionsFor(...args).map((a) => a.id);

describe('actionsFor', () => {
	it('says when the pull request conflicts with its base, and offers to resolve that before anything else', () => {
		const state = {
			changes: clean,
			upstream: upstream({
				conflicts: true,
				checks: { state: 'failure', total: 3, failed: 1, url: null }
			})
		};
		expect(ids(state)).toEqual(['resolve-conflicts', 'fix-checks']);
		expect(standingOf(state)).toMatchObject({ label: 'Conflicts', tone: 'danger' });
		// nothing else in the way: still not mergeable
		expect(ids({ changes: clean, upstream: upstream({ conflicts: true }) })).toEqual([
			'resolve-conflicts'
		]);
		expect(ids({ changes: clean, upstream: upstream({ conflicts: false }) })).toEqual([
			'merge-pull'
		]);
		// resolving them is updating: no second button for it
		const incoming = { branch: 'refs/remotes/origin/main', commits: 2 };
		expect(
			ids({ changes: { ...clean, incoming }, upstream: upstream({ conflicts: true }) })
		).toEqual(['resolve-conflicts']);
	});

	it("does not offer to merge what the base branch's rules block", () => {
		const autoMerge = { enabled: false, canEnable: true, canDisable: false };
		// required checks that never reported, say
		const blocked = { changes: clean, upstream: upstream({ blocked: 'rules' }) };
		expect(ids(blocked)).toEqual([]);
		expect(standingOf(blocked)).toMatchObject({ label: 'Merge blocked', tone: 'danger' });
		expect(ids({ changes: clean, upstream: upstream({ blocked: 'rules', autoMerge }) })).toEqual([
			'enable-auto-merge'
		]);
		// a required review is what is missing
		expect(
			standingOf({ changes: clean, upstream: upstream({ blocked: 'rules', review: 'pending' }) })
		).toMatchObject({ label: 'Awaiting review' });
	});

	it('offers to sync, as the next step, a pull request that must be up to date to merge', () => {
		const incoming = { branch: 'refs/remotes/origin/main', commits: 2 };
		const state = {
			changes: { ...clean, incoming },
			upstream: upstream({ blocked: 'behind' })
		};
		const actions = actionsFor(state);
		expect(actions.map((a) => a.id)).toEqual(['merge-upstream']);
		expect(actions[0]).toMatchObject({ incomingCommits: 2 });
		expect(actions[0].aside).toBeUndefined();
		expect(actions[0].prompt).toContain('"origin/main"');
		expect(standingOf(state)).toMatchObject({ label: 'Behind base branch' });
		// not fetched yet: still the way to go
		expect(ids({ changes: clean, upstream: upstream({ blocked: 'behind' }) })).toEqual([
			'merge-upstream'
		]);
	});

	it('offers auto-merge only while the pull request cannot be merged yet', () => {
		const autoMerge = { enabled: false, canEnable: true, canDisable: false };
		const pending = { state: 'pending' as const, total: 3, failed: 0, url: null };
		expect(ids({ changes: clean, upstream: upstream({ autoMerge }) })).toEqual(['merge-pull']);
		expect(ids({ changes: clean, upstream: upstream({ autoMerge, checks: pending }) })).toEqual([
			'enable-auto-merge'
		]);
		expect(ids({ changes: clean, upstream: upstream({ autoMerge, review: 'pending' }) })).toEqual([
			'enable-auto-merge'
		]);
	});

	it('offers known base commits beside the next step, with an agent prompt', () => {
		const incoming = { branch: 'refs/remotes/origin/main', commits: 2 };
		const changes = { ...clean, incoming };
		expect(ids({ changes, upstream: null })).toEqual(['merge-upstream', 'archive']);
		expect(standingOf({ changes, upstream: null })?.label).toBe('Behind base branch');
		const actions = actionsFor({ changes, upstream: upstream({}) });
		expect(actions.map((action) => action.id)).toEqual(['merge-pull', 'merge-upstream']);
		expect(actions[1]).toMatchObject({
			aside: true,
			label: 'Sync',
			prompt: expect.stringContaining(incoming.branch)
		});
		expect(ids({ changes: { ...changes, uncommitted: 1 }, upstream: upstream() })).toEqual([
			'create-pull',
			'merge-upstream'
		]);
		const autoMerge = { enabled: true, canEnable: false, canDisable: true };
		expect(ids({ changes, upstream: upstream({ autoMerge }) })).toEqual([
			'merge-upstream',
			'cancel-auto-merge'
		]);
		for (const commits of [0, -1])
			expect(
				ids({ changes: { ...clean, incoming: { ...incoming, commits } }, upstream: null })
			).toEqual(['archive']);
		expect(ids({ changes: { ...clean, incoming: null }, upstream: null })).toEqual(['archive']);
	});

	it('never offers archiving a locked workspace (FDR-015)', () => {
		const locked = true;
		expect(ids({ changes: clean, upstream: null, locked })).toEqual([]);
		const merged = actionsFor({ changes: clean, upstream: upstream({ state: 'merged' }), locked });
		// carrying on is then the next step, not one beside it
		expect(merged).toMatchObject([{ id: 'continue', aside: false }]);
		// its work landed without a pull request: it carries on instead of being archived
		expect(ids({ changes: { ...clean, landed: true }, upstream: null, locked })).toEqual([
			'continue'
		]);
		const incoming = { branch: 'refs/heads/main', commits: 2 };
		expect(actionsFor({ changes: { ...clean, incoming }, upstream: null, locked })).toMatchObject([
			{ id: 'merge-upstream', aside: false }
		]);
	});

	it('does not offer upstream merges for completed work or a failed turn', () => {
		const changes = { ...clean, incoming: { branch: 'refs/heads/parent', commits: 1 } };
		for (const state of ['closed', 'merged'] as const)
			expect(ids({ changes, upstream: upstream({ state }) })).toEqual(['continue', 'archive']);
		expect(ids({ changes: { ...changes, landed: true }, upstream: null })).toEqual(['archive']);
		expect(ids({ changes, upstream: null, failed: true })).toEqual(['retry']);
	});

	it('offers Archive once the workspace is known to be clean', () => {
		expect(ids({ changes: null, upstream: upstream() })).toEqual([]);
		expect(ids({ changes: clean, upstream: upstream() })).toEqual(['archive']);
		expect(ids({ changes: clean, upstream: null })).toEqual(['archive']);
	});

	it('offers to commit when there is nowhere to push to', () => {
		const changes = { files: [file], uncommitted: 1, unpushed: null };
		expect(ids({ changes, upstream: null })).toEqual(['commit']);
		expect(ids({ changes: { ...changes, uncommitted: 0 }, upstream: null })).toEqual([]);
	});

	it('offers a pull request for work the forge does not have yet', () => {
		// uncommitted, committed but never pushed, and pushed but with more commits since
		for (const changes of [
			{ files: [file], uncommitted: 1, unpushed: null },
			{ files: [file], uncommitted: 0, unpushed: null },
			{ files: [file], uncommitted: 0, unpushed: 2 }
		])
			expect(ids({ changes, upstream: upstream(null, false) })).toEqual(['create-pull']);

		// pushed, nothing new, but no pull request yet: that is the step left
		const pushed = { changes: { ...clean, files: [file] }, upstream: upstream() };
		expect(ids(pushed)).toEqual(['create-pull']);
		expect(standingOf(pushed)?.label).toBe('Branch pushed');
		// A pushed branch with no work left can be archived.
		expect(ids({ changes: clean, upstream: upstream() })).toEqual(['archive']);
	});

	it('says when the work is where it was headed without a pull request, and offers to archive', () => {
		const landed = { files: [], uncommitted: 0, unpushed: null, landed: true };
		const merged = { changes: landed, upstream: upstream(null, false) };
		expect(ids(merged)).toEqual(['archive']);
		expect(standingOf(merged)).toMatchObject({ label: 'Merged', tone: 'merged' });
		expect(standingOf({ ...merged, child: true })?.label).toBe('Merged into parent');
		// also where there is no forge at all
		expect(ids({ changes: landed, upstream: null })).toEqual(['archive']);
		// more was done since: that is not landed
		expect(ids({ changes: { ...landed, uncommitted: 1 }, upstream: null })).toEqual(['commit']);
		// a pull request says how it stands, where there is one
		expect(standingOf({ changes: landed, upstream: upstream({ state: 'merged' }) })?.label).toBe(
			'Merged'
		);
	});

	it("says first when the agent's last turn failed, and offers to carry on", () => {
		const state = { changes: { ...clean, files: [file] }, upstream: upstream({}), failed: true };
		expect(ids(state)).toEqual(['retry']);
		expect(standingOf(state)).toMatchObject({ label: 'Turn failed', tone: 'danger' });
		expect(ids({ ...state, failed: false })).toEqual(['merge-pull']);
	});

	it('offers to merge once nothing stands in the way', () => {
		const changes = { files: [file], uncommitted: 0, unpushed: 0 };
		expect(ids({ changes, upstream: upstream({}) })).toEqual(['merge-pull']);
		// Geordi merges itself; there is nothing to say to the agent
		expect(actionsFor({ changes, upstream: upstream({}) })[0].prompt).toBeUndefined();
		expect(ids({ changes, upstream: upstream({ checks: null }) })).toEqual(['merge-pull']);

		const pending = { state: 'pending', total: 3, failed: 0, url: null } as const;
		expect(ids({ changes, upstream: upstream({ checks: pending }) })).toEqual([]);
		const draft = upstream({ draft: true });
		const [ready] = actionsFor({ changes, upstream: draft });
		expect(ready).toMatchObject({ id: 'ready-for-review', pullNumber: '42' });
		expect(ready.prompt).toBeUndefined();
		expect(ids({ changes, upstream: { ...draft, forge: 'gitlab' } })).toEqual([]);
		expect(
			ids({
				changes: { ...changes, unpushed: 1 },
				upstream: upstream({ draft: true, checks: pending })
			})
		).toEqual(['update-pull', 'ready-for-review']);
	});

	it('puts what blocks a merge first, and names the pull request', () => {
		const changes = { files: [file], uncommitted: 1, unpushed: 0 };
		const failing = { state: 'failure', total: 3, failed: 1, url: null } as const;
		const actions = actionsFor({
			changes,
			upstream: upstream({ checks: failing, review: 'changes_requested' })
		});
		expect(actions.map((action) => action.id)).toEqual([
			'fix-checks',
			'address-review',
			'update-pull'
		]);
		expect(actions[0].prompt).toContain('pull request #42');
	});

	it('offers to archive, or to carry on, once the pull request is merged or closed', () => {
		for (const state of ['merged', 'closed'] as const) {
			const actions = actionsFor({ changes: clean, upstream: upstream({ state }) });
			// done with, unless there is more to do in it: archiving is the next step,
			// carrying on the quiet alternative beside it
			expect(actions.map((action) => action.id)).toEqual(['continue', 'archive']);
			expect(actions.find((action) => !action.aside)?.id).toBe('archive');
			expect(actions[0].prompt).toBeUndefined();
		}
	});

	it('offers only to carry on when there is new work on a merged or closed branch', () => {
		// an agent may start a turn unasked after the merge: its edits go to the new branch
		for (const state of ['merged', 'closed'] as const) {
			const begun = { changes: { ...clean, uncommitted: 2 }, upstream: upstream({ state }) };
			const actions = actionsFor(begun);
			expect(actions.map((action) => action.id)).toEqual(['continue']);
			expect(actions[0].aside).toBeUndefined();
			expect(standingOf(begun)).toMatchObject({ label: 'Uncommitted changes', tone: 'accent' });
		}
	});
});

describe('standingOf', () => {
	const changes = { files: [file], uncommitted: 0, unpushed: 0 };
	const label = (...args: Parameters<typeof standingOf>) => standingOf(...args)?.label ?? null;

	it('says nothing when there is nothing to say', () => {
		expect(label({ changes: null, upstream: upstream({}) })).toBeNull();
		expect(label({ changes: clean, upstream: upstream() })).toBeNull();
		expect(label({ changes: clean, upstream: null })).toBeNull();
	});

	it('names what there is to do', () => {
		const dirty = { files: [file], uncommitted: 1, unpushed: 0 };
		expect(label({ changes: dirty, upstream: null })).toBe('Uncommitted changes');
		expect(label({ changes: dirty, upstream: upstream() })).toBe('Uncommitted changes');
		expect(label({ changes: dirty, upstream: upstream({}) })).toBe('Uncommitted changes');
		const ahead = { ...changes, unpushed: 1 };
		expect(label({ changes: ahead, upstream: upstream() })).toBe('Changes to publish');
		expect(label({ changes: ahead, upstream: upstream({}) })).toBe('Unpublished changes');
	});

	it('says when the work has nowhere to go because its forge is not set up', () => {
		const ahead = {
			files: [file],
			uncommitted: 0,
			unpushed: null,
			unknownForge: 'git.example.com'
		};
		expect(standingOf({ changes: ahead, upstream: null })).toMatchObject({
			label: 'Forge not set up',
			hint: { text: expect.stringContaining('git.example.com') }
		});
		expect(ids({ changes: ahead, upstream: null })).toEqual([]);
		// uncommitted work comes first: committing still works
		expect(label({ changes: { ...ahead, uncommitted: 1 }, upstream: null })).toBe(
			'Uncommitted changes'
		);
		// a local origin, or no work: nothing to say
		expect(label({ changes: { ...ahead, unknownForge: undefined }, upstream: null })).toBeNull();
		expect(
			label({ changes: { ...clean, unknownForge: 'git.example.com' }, upstream: null })
		).toBeNull();
	});

	it('puts what is wrong before what is merely unfinished', () => {
		const failing = { state: 'failure', total: 3, failed: 1, url: null } as const;
		const pending = { state: 'pending', total: 3, failed: 0, url: null } as const;
		const dirty = { files: [file], uncommitted: 1, unpushed: 0 };

		expect(standingOf({ changes: dirty, upstream: upstream({ checks: failing }) })).toMatchObject({
			label: 'Checks failing',
			tone: 'danger'
		});
		expect(label({ changes, upstream: upstream({ review: 'changes_requested' }) })).toBe(
			'Changes requested'
		);
		expect(label({ changes, upstream: upstream({ checks: pending }) })).toBe('Checks running');
		const autoMerge = { enabled: true, canEnable: false, canDisable: true };
		expect(
			standingOf({ changes, upstream: upstream({ checks: pending, autoMerge }) })
		).toMatchObject({ label: 'Checks running', autoMerge: true });
		expect(standingOf({ changes, upstream: upstream({ draft: true }) })).toBeNull();
	});

	it('says when a pull request is ready, merged or closed', () => {
		expect(standingOf({ changes, upstream: upstream({}) })).toMatchObject({
			label: 'Ready to merge',
			tone: 'ok'
		});
		expect(label({ changes, upstream: upstream({ state: 'merged' }) })).toBe('Merged');
		expect(label({ changes, upstream: upstream({ state: 'closed' }) })).toBe('Closed');
	});
});
