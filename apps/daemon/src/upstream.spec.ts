import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Thread } from 'forges';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { github, MergeMethodRequiredError, type MergeOptions } from 'forges';
import { conflictsOf, count, markDraftReady, merge, summarise } from './upstream.ts';
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

	it('says what else keeps an open pull request from being merged, where GitHub says', () => {
		const blocked = (raw: unknown, state: Thread['state'] = 'open') =>
			summarise(pull({ raw, state })).blocked;
		expect(blocked({ mergeStateStatus: 'BLOCKED' })).toBe('rules');
		expect(blocked({ mergeStateStatus: 'BEHIND' })).toBe('behind');
		expect(blocked({ mergeable_state: 'blocked' })).toBe('rules');
		expect(blocked({ mergeStateStatus: 'CLEAN' })).toBeUndefined();
		expect(blocked({ mergeStateStatus: 'UNSTABLE' })).toBeUndefined();
		expect(blocked({ mergeStateStatus: 'BLOCKED' }, 'merged')).toBeUndefined();
		expect(summarise(pull({ raw: {} }))).not.toHaveProperty('blocked');
	});
});

describe('upstream', () => {
	afterEach(() => vi.unstubAllEnvs());

	async function workspace(remote?: string) {
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-up-')));
		const git = (...args: string[]) => execFileSync('git', ['-C', repoPath, ...args]);
		git('init', '-q');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
		if (remote) git('remote', 'add', 'origin', remote);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
		return { worktree, ref: { repoPath, worktreeId: 'abcdefgh-1' } };
	}

	/**
	 * The module afresh, with GitHub configured from the environment: never the GitHub CLI
	 * of the machine the tests run on, which may take seconds to answer.
	 */
	async function configured(token = 'fixture') {
		vi.resetModules();
		vi.stubEnv('FORGES_GITHUB_ENABLED', 'true');
		vi.stubEnv('FORGES_GITHUB_TOKEN', token);
		return import('./upstream.ts');
	}

	it('enables auto-merge for the checked-out commit and cancels it through forges', async () => {
		const { setAutoMerge } = await configured();
		const { worktree, ref } = await workspace('git@github.com:acme/widgets.git');
		const sha = execFileSync('git', ['-C', ref.repoPath, 'rev-parse', 'HEAD'], {
			encoding: 'utf8'
		}).trim();
		const node = {
			__typename: 'PullRequest',
			id: 'PR_42',
			state: 'OPEN',
			headRefName: 'geordi/abcdefgh',
			baseRefName: 'main',
			baseRefOid: sha,
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
			await expect(setAutoMerge(worktree, request, () => false)).rejects.toThrow(
				'Push the workspace commit'
			);
			node.headRefOid = sha;
			await setAutoMerge(worktree, request, () => false);
			await setAutoMerge(worktree, request, () => false);
			await setAutoMerge(worktree, { ...request, enabled: false }, () => false);
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

	/**
	 * A GitHub with one repository's pull requests: it lists them with a validator, answers
	 * `304` when they did not change, and reads them in full. `asked` says what it was asked.
	 */
	function fakeGitHub() {
		type Pull = { number: number; state: 'open' | 'closed' | 'merged'; updatedAt: string };
		const github = { pulls: [] as Pull[], version: 0, limited: false, asked: [] as string[] };
		const branch = 'geordi/abcdefgh';
		const rest = (pull: Pull) => ({
			number: pull.number,
			title: 'Add the thing',
			state: pull.state === 'open' ? 'open' : 'closed',
			merged_at: pull.state === 'merged' ? pull.updatedAt : null,
			html_url: `https://github.com/acme/widgets/pull/${pull.number}`,
			updated_at: pull.updatedAt,
			created_at: pull.updatedAt,
			user: { login: 'agent' },
			head: { ref: branch, sha: 'abc', repo: { full_name: 'acme/widgets', name: 'widgets' } },
			base: { ref: 'main' }
		});
		const respond = async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(input));
			if (github.limited) {
				github.asked.push('refused');
				const reset = String(Math.ceil(Date.now() / 1000) + 3600);
				return Response.json(
					{ message: 'API rate limit exceeded' },
					{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } }
				);
			}
			const single = /\/pulls\/(\d+)$/.exec(url.pathname);
			const pull =
				single && github.pulls.find((candidate) => candidate.number === Number(single[1]));
			if (pull) {
				github.asked.push('read');
				return Response.json(rest(pull));
			}
			if (url.pathname === '/search/issues') {
				expect(url.searchParams.get('q')).toContain('head:' + branch);
				github.asked.push('search');
				return Response.json({
					total_count: github.pulls.length,
					items: github.pulls.map((pr) => ({ ...rest(pr), pull_request: {} }))
				});
			}
			if (url.pathname.endsWith('/pulls')) {
				const etag = `"v${github.version}"`;
				if (new Headers(init?.headers).get('if-none-match') === etag) {
					github.asked.push('unchanged');
					return new Response(null, { status: 304, headers: { etag } });
				}
				github.asked.push('list');
				return Response.json(github.pulls.map(rest), { headers: { etag } });
			}
			if (url.pathname === '/graphql') {
				const { variables } = JSON.parse(String(init?.body));
				github.asked.push('read');
				const data = Object.fromEntries(
					Object.entries(variables)
						.filter(([name]) => name.startsWith('k'))
						.map(([name, number]) => {
							const pull = github.pulls.find((candidate) => candidate.number === number);
							const node = pull && {
								__typename: 'PullRequest',
								id: `PR_${pull.number}`,
								number: pull.number,
								title: 'Add the thing',
								url: `https://github.com/acme/widgets/pull/${pull.number}`,
								state: pull.state.toUpperCase(),
								updatedAt: pull.updatedAt,
								headRefName: branch,
								baseRefName: 'main'
							};
							return [`t${name.slice(1)}`, { issueOrPullRequest: node ?? null }];
						})
				);
				return Response.json({ data });
			}
			// what else a full read takes without GraphQL: its checks
			github.asked.push(`more of ${url.pathname}`);
			return Response.json({ total_count: 0, check_runs: [], statuses: [], state: 'pending' });
		};
		vi.stubGlobal('fetch', respond);
		return github;
	}

	it('follows a branch through the listing of recent pull requests, asking nothing twice', async () => {
		const { upstream: read } = await configured();
		const github = fakeGitHub();
		const { worktree, ref } = await workspace('git@github.com:acme/widgets.git');
		const git = (...args: string[]) =>
			execFileSync('git', [
				'-C',
				ref.repoPath,
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@t',
				...args
			]);
		const remoteBranch = 'refs/remotes/origin/geordi/abcdefgh';
		try {
			git('update-ref', remoteBranch, 'HEAD');
			// all of the repository's pull requests are listed: none is this branch's
			const initial = await read(worktree, ref, 1000);
			expect(initial?.pull).toBeNull();
			expect(initial?.refreshAfterMs).toBe(20_000);
			expect(await read(worktree, ref, 9000)).toBe(initial);
			expect((await read(worktree, ref, 21_000))?.pull).toBeNull();
			expect(github.asked).toEqual(['list', 'unchanged']);

			// pushed: looked at more closely for a while, the listing still fresh
			git('commit', '-q', '--allow-empty', '-m', 'push');
			git('update-ref', remoteBranch, 'HEAD');
			expect((await read(worktree, ref, 22_000))?.refreshAfterMs).toBe(10_000);
			expect(github.asked).toHaveLength(2);

			// The PR is searchable before the repository listing's validator changes.
			github.pulls.push({ number: 42, state: 'open', updatedAt: '2026-11-18T10:00:00Z' });
			const opened = await read(worktree, { ...ref, fresh: true }, 22_001);
			expect(opened?.pull?.number).toBe('42');
			expect(github.asked.slice(2)).toEqual(['unchanged', 'search', 'read']);
			// unchanged since, it is not read again; a minute on, it is
			const before = github.asked.length;
			expect((await read(worktree, ref, 42_000))?.pull?.number).toBe('42');
			expect(github.asked.slice(before)).toEqual(['unchanged']);
			await read(worktree, ref, 93_000);
			expect(github.asked.slice(before)).toEqual(['unchanged', 'unchanged', 'read']);

			// merged: the listing says so
			github.pulls[0] = { number: 42, state: 'merged', updatedAt: '2026-11-18T11:00:00Z' };
			github.version++;
			const merged = await read(worktree, ref, 104_000);
			expect(merged?.pull?.state).toBe('merged');
			expect(merged?.refreshAfterMs).toBe(60_000);
			expect(await read(worktree, ref, 150_000)).toBe(merged);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
		}
	});

	it('keeps what it knew while rate limited, and asks nothing until the limit resets', async () => {
		const { upstream: read } = await configured();
		const github = fakeGitHub();
		github.pulls.push({ number: 42, state: 'merged', updatedAt: '2026-11-18T10:00:00Z' });
		const { worktree, ref } = await workspace('git@github.com:acme/widgets.git');
		execFileSync('git', [
			'-C',
			ref.repoPath,
			'update-ref',
			'refs/remotes/origin/geordi/abcdefgh',
			'HEAD'
		]);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const merged = await read(worktree, ref, 1000);
			expect(merged?.pull?.state).toBe('merged');
			github.limited = true;
			expect(await read(worktree, ref, 100_000)).toBe(merged);
			expect(await read(worktree, { ...ref, fresh: true }, 200_000)).toBe(merged);
			expect(github.asked.filter((asked) => asked === 'refused')).toHaveLength(1);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
		}
	});

	it('knows a pull request without credentials, and looks again only now and then', async () => {
		const { upstream: read } = await configured('');
		const github = fakeGitHub();
		github.pulls.push({ number: 42, state: 'open', updatedAt: '2026-11-18T10:00:00Z' });
		const { worktree, ref } = await workspace('git@github.com:acme/widgets.git');
		execFileSync('git', [
			'-C',
			ref.repoPath,
			'update-ref',
			'refs/remotes/origin/geordi/abcdefgh',
			'HEAD'
		]);
		try {
			const open = await read(worktree, ref, 1000);
			expect(open?.pull?.number).toBe('42');
			expect(open?.refreshAfterMs).toBe(300_000);
			const asked = github.asked.length;
			expect(await read(worktree, ref, 200_000)).toBe(open);
			expect(github.asked).toHaveLength(asked);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
		}
	});

	it('is nothing for repositories without a remote, or on a forge we do not know', async () => {
		const { upstream: read } = await configured();
		const local = await workspace();
		expect(await read(local.worktree, local.ref)).toBeNull();
		const elsewhere = await workspace('git@git.example.invalid:acme/widgets.git');
		expect(await read(elsewhere.worktree, elsewhere.ref)).toBeNull();
	});

	it('knows the repository, and asks the forge nothing while the branch is not pushed', async () => {
		const { upstream: read } = await configured();
		const { worktree, ref } = await workspace('git@github.com:acme/widgets.git');
		expect(await read(worktree, ref, 123)).toEqual({
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
				expect(query).toContain('mergeStateStatus');
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
