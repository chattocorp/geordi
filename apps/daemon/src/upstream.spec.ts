import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Thread } from 'forges';
import { describe, expect, it } from 'vitest';
import { github, MergeMethodRequiredError, type MergeOptions } from 'forges';
import { conflictsOf, count, markDraftReady, merge, summarise, upstream } from './upstream.ts';
import { ensureWorktree } from './worktree.ts';

/** A pull request as `forges` reports it, with only the fields we read. */
const pull = (overrides: Partial<Thread> = {}) =>
	({
		ref: { number: '42' },
		title: 'Add the thing',
		url: 'https://github.com/acme/widgets/pull/42',
		state: 'open',
		isDraft: false,
		reviewers: [],
		branches: { head: { ref: 'geordi/abc' }, base: { ref: 'main' } },
		...overrides
	}) as Thread;

const reviewer = (state: string) => ({ state }) as Thread['reviewers'][number];

describe('summarise', () => {
	it('reports state, target branch and checks', () => {
		const checks = { state: 'failure', total: 18, failed: 2, url: 'https://checks' } as const;
		expect(summarise(pull({ checks, isDraft: true }))).toEqual({
			number: '42',
			title: 'Add the thing',
			url: 'https://github.com/acme/widgets/pull/42',
			state: 'open',
			draft: true,
			base: 'main',
			checks,
			review: null
		});
	});

	it('says how many checks stand how, where that is known', () => {
		const checks = { state: 'pending', total: 5 } as const;
		const counts = count(['success', 'success', 'pending', 'neutral', 'unknown']);
		expect(counts).toEqual({ passed: 2, failed: 0, pending: 1, skipped: 2 });
		expect(summarise(pull({ checks }), counts).checks?.counts).toEqual(counts);
		expect(summarise(pull({ checks })).checks).not.toHaveProperty('counts');
	});

	it('shows no checks when there are none', () => {
		expect(summarise(pull()).checks).toBeNull();
		expect(summarise(pull({ checks: { state: 'unknown', total: 0 } })).checks).toBeNull();
	});

	it('lets the most decisive review speak', () => {
		const review = (...states: string[]) =>
			summarise(pull({ reviewers: states.map(reviewer) })).review;
		expect(review('pending', 'approved')).toBe('approved');
		expect(review('approved', 'changes_requested', 'pending')).toBe('changes_requested');
		expect(review('pending', 'commented')).toBe('pending');
		expect(review('commented')).toBeNull();
	});

	it('says whether an open pull request conflicts with its base, where the forge says', () => {
		const conflicts = (raw: unknown, state: Thread['state'] = 'open') =>
			conflictsOf(pull({ raw, state }));
		// GitHub: `mergeable_state`, worked out lazily
		expect(conflicts({ mergeable: false, mergeable_state: 'dirty' })).toBe(true);
		expect(conflicts({ mergeable: false, mergeable_state: 'blocked' })).toBe(false);
		expect(conflicts({ mergeable: null, mergeable_state: 'unknown' })).toBeUndefined();
		// GitLab, then Gitea and Forgejo
		expect(conflicts({ has_conflicts: true, mergeable: true })).toBe(true);
		expect(conflicts({ mergeable: false })).toBe(true);
		expect(conflicts({ mergeable: true })).toBe(false);
		// nothing to go on, or nothing to merge any more
		expect(conflicts({})).toBeUndefined();
		expect(conflicts({ mergeable_state: 'dirty' }, 'merged')).toBeUndefined();
		expect(summarise(pull({ raw: {} }))).not.toHaveProperty('conflicts');
		expect(summarise(pull({ raw: { mergeable_state: 'dirty' } })).conflicts).toBe(true);
	});
});

describe('upstream', () => {
	function workspace(remote?: string) {
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-up-')));
		const git = (...args: string[]) => execFileSync('git', ['-C', repoPath, ...args]);
		git('init', '-q');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
		if (remote) git('remote', 'add', 'origin', remote);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, 'abcdefgh-1');
		return { worktree, ref: { repoPath, worktreeId: 'abcdefgh-1' } };
	}

	it('is nothing for repositories without a remote, or on a forge we do not know', async () => {
		const local = workspace();
		expect(await upstream(local.worktree, local.ref)).toBeNull();
		const elsewhere = workspace('git@git.example.invalid:acme/widgets.git');
		expect(await upstream(elsewhere.worktree, elsewhere.ref)).toBeNull();
	});

	it('knows the repository, and asks the forge nothing while the branch is not pushed', async () => {
		const { worktree, ref } = workspace('git@github.com:acme/widgets.git');
		expect(await upstream(worktree, ref)).toEqual({
			forge: 'github',
			repo: 'acme/widgets',
			repoUrl: 'https://github.com/acme/widgets',
			branch: 'geordi/abcdefgh',
			pushed: false,
			createUrl: null,
			pull: null
		});
	});
});

describe('merge', () => {
	const ref = pull().ref;
	/** A forge that allows these ways of merging, and notes how it was asked to. */
	const forge = (allowed: MergeOptions['method'][]) => {
		const asked: MergeOptions[] = [];
		return {
			asked,
			async merge(_ref: unknown, options: MergeOptions = {}) {
				asked.push(options);
				if (allowed.length > 1 && !options.method)
					throw new MergeMethodRequiredError(allowed.flatMap((method) => method ?? []));
				return { status: 'merged' as const };
			}
		};
	};

	it('merges the commit it was given, the one way the repository allows', async () => {
		const threads = forge(['rebase']);
		expect(await merge(threads, ref, 'abc')).toEqual({ status: 'merged' });
		expect(threads.asked).toEqual([{ sha: 'abc' }]);
	});

	it('squashes where the repository allows several ways', async () => {
		const threads = forge(['merge', 'rebase', 'squash']);
		await merge(threads, ref, 'abc');
		expect(threads.asked.at(-1)).toEqual({ sha: 'abc', method: 'squash' });
	});

	it('takes what there is where squashing is not allowed', async () => {
		const threads = forge(['rebase', 'merge']);
		await merge(threads, ref, 'abc');
		expect(threads.asked.at(-1)).toEqual({ sha: 'abc', method: 'merge' });
	});
});

describe('markDraftReady', () => {
	const repo = { forge: 'github', instance: 'github.com', owner: 'acme', name: 'widgets' } as const;
	const draft = pull({ isDraft: true, ref: { ...pull().ref, externalId: 'PR_42' } });

	it('sends the draft node ID through the configured GitHub provider', async () => {
		const calls: unknown[] = [];
		const provider = github({
			auth: { type: 'token', token: 'test-token' },
			fetch: async (url, init) => {
				expect(new URL(url).pathname).toBe('/graphql');
				calls.push(JSON.parse(String(init?.body)));
				return Response.json({
					data: { markPullRequestReadyForReview: { pullRequest: { id: 'PR_42' } } }
				});
			}
		});
		await markDraftReady(provider, repo, 'geordi/abc', draft);
		await markDraftReady(provider, repo, 'geordi/abc', pull());
		expect(calls).toEqual([
			{
				operationName: 'MarkReady',
				query: expect.stringContaining('markPullRequestReadyForReview'),
				variables: { id: 'PR_42' }
			}
		]);
	});

	it('rejects a closed pull request or a pull request from another branch before writing', async () => {
		const provider = github({
			fetch: () => {
				throw new Error('Unexpected request');
			}
		});
		await expect(markDraftReady(provider, repo, 'other', draft)).rejects.toThrow(
			'no longer open for other'
		);
		await expect(
			markDraftReady(provider, repo, 'geordi/abc', { ...draft, state: 'closed' })
		).rejects.toThrow('no longer open for geordi/abc');
	});
});
