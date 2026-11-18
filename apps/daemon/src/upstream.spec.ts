import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Thread } from 'forges';
import { describe, expect, it, vi } from 'vitest';
import { github, MergeMethodRequiredError, type MergeOptions } from 'forges';
import { conflictsOf, count, markDraftReady, merge, summarise, upstream } from './upstream.ts';
import { readPull, rollupCounts } from './pull-batch.ts';
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
		expect(summarise(pull({ checks, body: 'PR description', isDraft: true }))).toEqual({
			number: '42',
			body: 'PR description',
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

	it('enables auto-merge for the checked-out commit and cancels it through forges', async () => {
		vi.resetModules();
		vi.stubEnv('FORGES_GITHUB_ENABLED', 'true');
		vi.stubEnv('FORGES_GITHUB_TOKEN', 'fixture');
		const { setAutoMerge } = await import('./upstream.ts');
		const { worktree, ref } = workspace('git@github.com:acme/widgets.git');
		const sha = execFileSync('git', ['-C', ref.repoPath, 'rev-parse', 'HEAD'], {
			encoding: 'utf8'
		}).trim();
		const node = {
			__typename: 'PullRequest',
			id: 'PR_42',
			state: 'OPEN',
			headRefName: 'geordi/abcdefgh',
			baseRefName: 'main',
			headRefOid: 'stale',
			repository: { squashMergeAllowed: true },
			viewerCanEnableAutoMerge: true,
			autoMergeRequest: null as { enabledAt: string } | null
		};
		const writes: unknown[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			const { operationName, variables } = JSON.parse(String(init.body));
			if (operationName === 'ThreadsBatch')
				return Response.json({ data: { t0: { issueOrPullRequest: node } } });
			writes.push({ operationName, variables });
			node.autoMergeRequest = operationName === 'EnableAutoMerge' ? { enabledAt: 'today' } : null;
			return Response.json({ data: {} });
		});
		try {
			const request = { ...ref, pullNumber: '42', enabled: true };
			await expect(setAutoMerge(worktree, request)).rejects.toThrow('Push the workspace commit');
			node.headRefOid = sha;
			await setAutoMerge(worktree, request);
			await setAutoMerge(worktree, request);
			await setAutoMerge(worktree, { ...request, enabled: false });
			expect(writes).toEqual([
				{
					operationName: 'EnableAutoMerge',
					variables: {
						input: { pullRequestId: 'PR_42', expectedHeadOid: sha, mergeMethod: 'SQUASH' }
					}
				},
				{ operationName: 'DisableAutoMerge', variables: { id: 'PR_42' } }
			]);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
		}
	});

	it.each([true, false])(
		'follows a pushed commit with authenticated access %s',
		async (authenticated) => {
			// A fresh provider registry for each credential mode.
			vi.resetModules();
			vi.stubEnv('FORGES_GITHUB_ENABLED', 'true');
			vi.stubEnv('FORGES_GITHUB_TOKEN', authenticated ? 'fixture' : '');
			const { upstream: read } = await import('./upstream.ts');
			const search = vi.fn(async () => Response.json({ total_count: 0, items: [] }));
			vi.stubGlobal('fetch', search);
			const { worktree, ref } = workspace('git@github.com:acme/widgets.git');
			const git = (...args: string[]) => execFileSync('git', ['-C', ref.repoPath, ...args]);
			const remoteBranch = 'refs/remotes/origin/geordi/abcdefgh';
			try {
				git('update-ref', remoteBranch, 'HEAD');
				const initial = await read(worktree, ref, 1000);
				expect(initial?.refreshAfterMs).toBe(authenticated ? 60_000 : 300_000);
				expect(await read(worktree, ref, 9000)).toBe(initial);
				await read(worktree, ref, 11_000);
				const settled = await read(worktree, ref, 61_000);
				expect(settled?.refreshAfterMs).toBe(authenticated ? 60_000 : 300_000);
				expect(search).toHaveBeenCalledTimes(authenticated ? 2 : 1);
				git(
					'-c',
					'user.name=t',
					'-c',
					'user.email=t@t',
					'commit',
					'-q',
					'--allow-empty',
					'-m',
					'push'
				);
				git('update-ref', remoteBranch, 'HEAD');
				const pushed = await read(worktree, ref, 62_000);
				expect(pushed?.refreshAfterMs).toBe(authenticated ? 10_000 : 300_000);
				expect(search).toHaveBeenCalledTimes(authenticated ? 3 : 1);
				await read(worktree, ref, 72_000);
				expect(search).toHaveBeenCalledTimes(authenticated ? 4 : 1);
				expect((await read(worktree, ref, 122_000))?.refreshAfterMs).toBe(
					authenticated ? 60_000 : 300_000
				);
				if (authenticated) {
					const newWorkspace = { ...ref, worktreeId: 'first-push' };
					git('update-ref', '-d', remoteBranch);
					expect((await read(worktree, newWorkspace, 123_000))?.pushed).toBe(false);
					git('update-ref', remoteBranch, 'HEAD');
					expect((await read(worktree, newWorkspace, 124_000))?.refreshAfterMs).toBe(10_000);
				}
			} finally {
				vi.unstubAllGlobals();
				vi.unstubAllEnvs();
			}
		}
	);

	it('rarely looks again at a merged pull request, and keeps what it knew while rate limited', async () => {
		vi.resetModules();
		vi.stubEnv('FORGES_GITHUB_ENABLED', 'true');
		vi.stubEnv('FORGES_GITHUB_TOKEN', 'fixture');
		const { upstream: read } = await import('./upstream.ts');
		const { worktree, ref } = workspace('git@github.com:acme/widgets.git');
		execFileSync('git', [
			'-C',
			ref.repoPath,
			'update-ref',
			'refs/remotes/origin/geordi/abcdefgh',
			'HEAD'
		]);
		let limited = false;
		const asked = vi.fn(async (url: string) => {
			if (limited)
				return Response.json(
					{ message: 'API rate limit exceeded' },
					{
						status: 403,
						headers: {
							'x-ratelimit-remaining': '0',
							'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 3600)
						}
					}
				);
			if (url.includes('/search/'))
				return Response.json({
					total_count: 1,
					items: [
						{
							number: 42,
							title: 'Add the thing',
							state: 'closed',
							html_url: 'https://github.com/acme/widgets/pull/42',
							repository_url: 'https://api.github.com/repos/acme/widgets',
							pull_request: { url: 'https://api.github.com/repos/acme/widgets/pulls/42' }
						}
					]
				});
			return Response.json({
				data: {
					t0: {
						issueOrPullRequest: {
							__typename: 'PullRequest',
							id: 'PR_42',
							number: 42,
							title: 'Add the thing',
							url: 'https://github.com/acme/widgets/pull/42',
							state: 'MERGED',
							headRefName: 'geordi/abcdefgh',
							baseRefName: 'main'
						}
					}
				}
			});
		});
		vi.stubGlobal('fetch', asked);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const merged = await read(worktree, ref, 1000);
			expect(merged?.pull?.state).toBe('merged');
			expect(merged?.refreshAfterMs).toBe(600_000);
			const calls = asked.mock.calls.length;
			expect(await read(worktree, ref, 500_000)).toBe(merged);
			expect(asked).toHaveBeenCalledTimes(calls);
			// due again, but refused: what was known stands, and nothing more is asked
			limited = true;
			expect(await read(worktree, ref, 700_000)).toBe(merged);
			const refused = asked.mock.calls.length;
			expect(await read(worktree, { ...ref, fresh: true }, 800_000)).toBe(merged);
			expect(asked).toHaveBeenCalledTimes(refused);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
		}
	});

	it('is nothing for repositories without a remote, or on a forge we do not know', async () => {
		const local = workspace();
		expect(await upstream(local.worktree, local.ref)).toBeNull();
		const elsewhere = workspace('git@git.example.invalid:acme/widgets.git');
		expect(await upstream(elsewhere.worktree, elsewhere.ref)).toBeNull();
	});

	it('knows the repository, and asks the forge nothing while the branch is not pushed', async () => {
		const { worktree, ref } = workspace('git@github.com:acme/widgets.git');
		expect(await upstream(worktree, ref, 123)).toEqual({
			localBranch: 'geordi/abcdefgh',
			checkedAt: 123,
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

describe('batched GitHub status', () => {
	it('reads two repositories in one request with reviews, conflicts and grouped CI counts', async () => {
		let requests = 0;
		const provider = github({
			auth: { type: 'token', token: 'test' },
			fetch: async (_, init) => {
				requests++;
				const { query, variables } = JSON.parse(String(init?.body));
				expect(query).toContain('reviewDecision');
				expect(query).toContain('mergeable');
				expect(variables.n0).toBe('one');
				expect(variables.n1).toBe('two');
				expect(variables).not.toHaveProperty('n2');
				const thread = {
					__typename: 'PullRequest',
					state: 'OPEN',
					headRefName: 'feature',
					baseRefName: 'main',
					reviewDecision: 'APPROVED',
					mergeable: 'CONFLICTING',
					commits: {
						nodes: [
							{
								commit: {
									statusCheckRollup: {
										state: 'PENDING',
										contexts: {
											totalCount: 5,
											checkRunCountsByState: [
												{ state: 'SUCCESS', count: 1 },
												{ state: 'IN_PROGRESS', count: 1 },
												{ state: 'SKIPPED', count: 1 },
												{ state: 'FAILURE', count: 1 }
											],
											statusContextCountsByState: [{ state: 'SUCCESS', count: 1 }]
										}
									}
								}
							}
						]
					}
				};
				return Response.json({ data: { t0: { issueOrPullRequest: thread }, t1: null } });
			}
		});
		const reads = await Promise.all(
			['one', 'two', 'one'].map((name) => {
				const repo = { forge: 'github', instance: 'github.com', owner: 'acme', name };
				return readPull(provider, { ...repo, repo, kind: 'pull_request', number: '1' });
			})
		);
		expect(requests).toBe(1);
		const [thread, missing, repeated] = reads;
		expect(repeated).toBe(thread);
		expect(missing).toBeNull();
		expect(thread).toBeTruthy();
		expect(summarise(thread!, rollupCounts(thread!))).toMatchObject({
			review: 'approved',
			conflicts: true,
			checks: { state: 'pending', counts: { passed: 2, failed: 1, pending: 1, skipped: 1 } }
		});
	});
});
