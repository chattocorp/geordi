import type { PullRequest, Upstream } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { actionsFor } from './actions.ts';

const clean = { files: [], uncommitted: 0, unpushed: 0 };
const file = { path: 'a.txt', added: 1, removed: 0 };

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
	it('offers nothing while it knows nothing, or when there is nothing to do', () => {
		expect(ids({ changes: null, upstream: upstream() })).toEqual([]);
		expect(ids({ changes: clean, upstream: upstream() })).toEqual([]);
		expect(ids({ changes: clean, upstream: null })).toEqual([]);
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

		// pushed, nothing new, but no pull request yet: nothing to create it from locally
		expect(ids({ changes: { ...clean, files: [file] }, upstream: upstream() })).toEqual([]);
	});

	it('offers to merge once nothing stands in the way', () => {
		const changes = { files: [file], uncommitted: 0, unpushed: 0 };
		expect(ids({ changes, upstream: upstream({}) })).toEqual(['merge-pull']);
		expect(ids({ changes, upstream: upstream({ checks: null }) })).toEqual(['merge-pull']);

		const pending = { state: 'pending', total: 3, failed: 0, url: null } as const;
		expect(ids({ changes, upstream: upstream({ checks: pending }) })).toEqual([]);
		expect(ids({ changes, upstream: upstream({ draft: true }) })).toEqual([]);
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

	it('offers to archive once the pull request is merged or closed', () => {
		for (const state of ['merged', 'closed'] as const) {
			const actions = actionsFor({ changes: clean, upstream: upstream({ state }) });
			expect(actions.map((action) => action.id)).toEqual(['archive']);
			expect(actions[0].prompt).toBeUndefined();
		}
	});
});
