import { describe, expect, it } from 'vitest';
import type { Upstream } from '@geordi/protocol';
import { archiveConcerns } from './archiving.ts';

const file = { path: 'a.txt', status: 'modified' as const, added: 1, removed: 0 };
const upstream = (pull: Partial<NonNullable<Upstream['pull']>> | null): Upstream => ({
	forge: 'github',
	repo: 'acme/widgets',
	repoUrl: null,
	branch: 'geordi/abc',
	pushed: true,
	createUrl: null,
	pull: pull && {
		number: '7',
		title: 'A change',
		url: null,
		state: 'open',
		draft: false,
		base: 'main',
		checks: null,
		review: null,
		...pull
	}
});

describe('archiveConcerns', () => {
	it('has nothing to say about a workspace without work, or with work that has landed', () => {
		expect(
			archiveConcerns({
				changes: { files: [], uncommitted: 0, unpushed: 0 },
				upstream: upstream(null)
			})
		).toEqual([]);
		const landed = { files: [file], uncommitted: 0, unpushed: 0 };
		expect(archiveConcerns({ changes: landed, upstream: upstream({ state: 'merged' }) })).toEqual(
			[]
		);
		// nor where nobody could tell
		expect(archiveConcerns({ changes: null, upstream: null })).toEqual([]);
	});

	it('checks pull requests and commits even with no file changes', () => {
		const clean = { files: [], uncommitted: 0, unpushed: 0 };
		for (const state of ['open', 'closed'] as const) {
			expect(archiveConcerns({ changes: clean, upstream: upstream({ state }) })).toEqual([
				{ label: 'Pull request #7 is not merged.' }
			]);
		}
		expect(archiveConcerns({ changes: { ...clean, unmerged: true } })).toEqual([
			{ label: 'Its branch has unmerged commits.' }
		]);
	});

	it('says what would be lost: uncommitted changes', () => {
		const concerns = archiveConcerns({
			changes: {
				files: [file, { ...file, path: 'committed.txt' }],
				uncommittedPaths: ['a.txt', 'new.txt'],
				uncommitted: 2,
				unpushed: 0
			},
			upstream: upstream(null)
		});
		expect(concerns).toEqual([
			{
				label: '2 files have uncommitted changes, which will be discarded.',
				items: ['a.txt', 'new.txt']
			}
		]);
	});

	it('says what is nowhere but here: commits that were not pushed', () => {
		const never = archiveConcerns({
			changes: { files: [file], uncommitted: 0, unpushed: null },
			upstream: upstream(null)
		});
		expect(never).toEqual([{ label: expect.stringMatching(/never pushed/) }]);

		const some = archiveConcerns({
			changes: { files: [file], uncommitted: 0, unpushed: 1 },
			upstream: upstream({})
		});
		expect(some).toEqual([
			{ label: '1 commit is not pushed. They stay on its branch, on this machine only.' },
			{ label: 'Pull request #7 is not merged.' }
		]);
	});

	it('says what has not landed: an open pull request, or none at all', () => {
		const pushed = { files: [file], uncommitted: 0, unpushed: 0 };
		expect(archiveConcerns({ changes: pushed, upstream: upstream({}) })).toEqual([
			{ label: 'Pull request #7 is not merged.' }
		]);
		expect(archiveConcerns({ changes: pushed, upstream: upstream(null) })).toEqual([
			{ label: expect.stringMatching(/no pull request/) }
		]);
		// the forge didn't answer in time: nothing is claimed about a pull request
		expect(archiveConcerns({ changes: pushed })).toEqual([
			{ label: 'Its branch has unmerged commits.' }
		]);
		// a merged pull request with something uncommitted on top: only that is lost
		expect(
			archiveConcerns({
				changes: { files: [file], uncommitted: 1, unpushed: 0 },
				upstream: upstream({ state: 'merged' })
			})
		).toEqual([{ label: expect.stringMatching(/uncommitted/) }]);
	});
});
