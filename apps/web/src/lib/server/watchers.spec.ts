import type { ForgeMessage, Upstream } from '@geordi/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createStandings } from './standings.ts';
import { actionsFor } from '../actions.ts';
import { createWatchers, type WorktreeLoad, type WorktreeState } from './watchers.ts';

/** Lets pending loads settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve));

const stateWith = (uncommitted: number): WorktreeState => ({
	changes: { branch: 'geordi/w', files: [], uncommitted, unpushed: null, landed: false },
	unavailable: null,
	missing: false,
	config: null,
	release: null,
	upstream: null
});

function answers(uncommitted: number): WorktreeLoad {
	const { changes, unavailable, missing } = stateWith(uncommitted);
	return {
		local: Promise.resolve({ changes, unavailable, missing }),
		upstream: () => Promise.resolve(null),
		details: () => ({ config: Promise.resolve(null), release: Promise.resolve(null) })
	};
}

function setup(load = answers, knownUpstream: () => Upstream | undefined = () => undefined) {
	const sent: ForgeMessage[] = [];
	/** What the daemon would say about each worktree, and how often it was asked. */
	const daemon = { uncommitted: 0, asked: [] as string[], fresh: [] as boolean[] };
	const note = vi.fn();
	const watchers = createWatchers(
		(message) => (sent.push(message), true),
		(worktreeId) => {
			if (worktreeId === 'missing') throw new Error('Workspace missing not found');
			return { worktreeId, repoPath: '/repo' };
		},
		(worktreeId, fresh) => {
			daemon.asked.push(worktreeId);
			daemon.fresh.push(fresh);
			return load(daemon.uncommitted);
		},
		note,
		knownUpstream
	);
	/** The worktrees the daemon was last told to watch. */
	const watching = () => {
		const last = sent.at(-1);
		return last?.type === 'watch' ? last.worktrees.map((ref) => ref.worktreeId) : null;
	};
	return { watchers, sent, watching, daemon, note };
}

describe('watchers', () => {
	it('has the daemon watch a worktree from its first viewer to its last', () => {
		const { watchers, sent, watching } = setup();
		const first = watchers.watch('a', () => {});
		expect(watching()).toEqual(['a']);
		const second = watchers.watch('a', () => {});
		const other = watchers.watch('b', () => {});
		expect(watching()).toEqual(['a', 'b']);
		expect(sent).toHaveLength(2);

		first();
		expect(sent).toHaveLength(2);
		second();
		expect(watching()).toEqual(['b']);
		other();
		expect(watching()).toEqual([]);
	});

	it('reuses recent status on entry until it expires or local Git reports another branch', async () => {
		const cached: Upstream = {
			forge: 'github',
			repo: 'a/b',
			repoUrl: null,
			branch: 'remote-name',
			localBranch: 'geordi/w',
			checkedAt: Date.now(),
			refreshAfterMs: 10_000,
			pushed: true,
			createUrl: null,
			pull: null
		};
		const upstream = vi.fn(async () => null);
		const { watchers } = setup(
			(n) => ({ ...answers(n), upstream }),
			() => cached
		);
		const open = () => watchers.watch('a', () => {});
		const close = open();
		expect(watchers.state('a')).toMatchObject({ checking: false, upstream: cached });
		const newer = { ...cached, checkedAt: cached.checkedAt! + 1 };
		watchers.noteUpstream('a', newer);
		await settled();
		expect(watchers.state('a')).toMatchObject({ version: 1, upstream: newer });
		expect(upstream).not.toHaveBeenCalled();
		watchers.refreshUpstream('a');
		await settled();
		expect(upstream).toHaveBeenCalledTimes(1);
		close();
		cached.localBranch = 'old';
		const closeAgain = open();
		await settled();
		expect(upstream).toHaveBeenCalledTimes(2);
		expect(watchers.state('a')?.upstream).toBeNull();
		closeAgain();
		cached.localBranch = 'geordi/w';
		cached.checkedAt = Date.now() - 10_000;
		open();
		await settled();
		expect(upstream).toHaveBeenCalledTimes(3);
	});

	it('loads the state once for everyone looking, and again when the daemon says it changed', async () => {
		const { watchers, daemon } = setup();
		const seen: string[] = [];
		watchers.watch('a', () => seen.push('a1'));
		watchers.watch('a', () => seen.push('a2'));
		watchers.watch('b', () => seen.push('b'));
		expect(watchers.state('a')).toBeNull();

		await settled();
		expect(daemon.asked).toEqual(['a', 'b']);
		expect(watchers.state('a')).toMatchObject(stateWith(0));
		expect(new Set(seen)).toEqual(new Set(['a1', 'a2', 'b']));
		seen.length = 0;

		daemon.uncommitted = 2;
		watchers.changed('a');
		watchers.changed('unknown');
		await settled();
		expect(daemon.asked).toEqual(['a', 'b', 'a']);
		expect(watchers.state('a')).toMatchObject(stateWith(2));
		expect(watchers.state('b')).toMatchObject(stateWith(0));
		// each look at a worktree is told apart from the one before, as the cue to load diffs again
		expect(watchers.state('a')!.version).toBeGreaterThan(watchers.state('b')!.version);
		expect(new Set(seen)).toEqual(new Set(['a1', 'a2']));
	});

	it('shows local changes during a slow upstream lookup and coalesces intervening edits', async () => {
		const upstream = Promise.withResolvers<null>();
		const release = Promise.withResolvers<null>();
		const { watchers, daemon, note } = setup((n) => ({
			...answers(n),
			upstream: () => upstream.promise,
			details: () => ({ config: Promise.resolve(null), release: release.promise })
		}));
		watchers.watch('a', () => {});
		await settled();
		expect(watchers.state('a')).toMatchObject({
			changes: { uncommitted: 0 },
			version: 1,
			checking: true
		});
		expect(note).not.toHaveBeenCalled();

		daemon.uncommitted = 3;
		watchers.changed('a');
		watchers.changed('a');
		upstream.resolve(null);
		await settled();
		expect(watchers.state('a')).toMatchObject({ version: 1, checking: false });
		expect(daemon.asked).toEqual(['a']);
		release.resolve(null);
		await settled();
		expect(daemon.fresh).toEqual([false, false]);
		expect(watchers.state('a')).toMatchObject({
			changes: { uncommitted: 3 },
			version: 2,
			checking: false
		});
		expect(note).toHaveBeenCalledTimes(2);
	});

	it('starts a fresh read at turn end and ignores the older response', async () => {
		const previous = Promise.withResolvers<null>();
		const { watchers, daemon, note } = setup((n) => ({
			...answers(n),
			...(n === 0 && { upstream: () => previous.promise })
		}));
		watchers.watch('a', () => {});
		await settled();
		daemon.uncommitted = 1;
		watchers.refreshUpstream('a');
		expect(daemon.fresh).toEqual([false, true]);
		await settled();
		expect(watchers.state('a')).toMatchObject({ changes: { uncommitted: 1 }, checking: false });
		const current = watchers.state('a');
		previous.resolve(null);
		await settled();
		expect(watchers.state('a')).toBe(current);
		expect(note).toHaveBeenCalledTimes(1);
	});

	it('refreshes the PR while release data is pending and still processes queued file changes', async () => {
		const release = Promise.withResolvers<null>();
		const details = vi.fn(() => ({ config: Promise.resolve(null), release: release.promise }));
		const { watchers, daemon } = setup((n) => ({ ...answers(n), details }));
		const close = watchers.watch('a', () => {});
		watchers.changed('a');
		await watchers.refreshUpstream('a');
		expect(details).toHaveBeenCalledTimes(1);
		expect(watchers.state('a')).toMatchObject({ checking: false, releasePending: true });
		release.resolve(null);
		await settled();
		expect(watchers.state('a')?.releasePending).toBe(false);
		expect(daemon.fresh).toEqual([false, true, false]);
		expect(details).toHaveBeenCalledTimes(2);
		await watchers.refreshUpstream('a');
		expect(details).toHaveBeenCalledTimes(2);
		close();
	});

	it('retains PR status on a failed lookup only while the branch matches', async () => {
		const status: Upstream = {
			forge: 'github',
			repo: 'a/b',
			repoUrl: null,
			branch: 'geordi/w',
			localBranch: 'geordi/w',
			pushed: true,
			createUrl: null,
			pull: {
				number: '1',
				title: 'Feature',
				body: '',
				url: null,
				state: 'open',
				draft: false,
				base: 'main',
				checks: null,
				review: null
			}
		};
		const upstream = vi.fn<() => Promise<Upstream | null>>().mockResolvedValue(status);
		let branch = 'geordi/w';
		const { watchers, note } = setup((n) => {
			const load = answers(n);
			return {
				...load,
				upstream,
				local: load.local.then((result) => ({ ...result, changes: { ...result.changes!, branch } }))
			};
		});
		const close = watchers.watch('a', () => {});
		await settled();
		upstream.mockRejectedValueOnce(Error('Timeout'));
		await watchers.refreshUpstream('a');
		expect(watchers.state('a')).toMatchObject({ upstream: status, checking: false });
		expect(note.mock.lastCall?.[1].upstream).toBe(status);
		upstream.mockResolvedValueOnce(null);
		await watchers.refreshUpstream('a');
		expect(watchers.state('a')?.upstream).toBeNull();
		await watchers.refreshUpstream('a');
		expect(watchers.state('a')?.upstream).toBe(status);
		branch = 'another';
		upstream.mockRejectedValueOnce(Error('Timeout'));
		await watchers.refreshUpstream('a');
		expect(watchers.state('a')?.upstream).toBeNull();
		close();
	});

	it('enables standing before release data and drops late answers after the last viewer leaves', async () => {
		const release = Promise.withResolvers<null>();
		const { watchers, daemon } = setup((n) => ({
			...answers(n),
			details: () => ({ config: Promise.resolve(null), release: release.promise })
		}));
		const stop = watchers.watch('a', () => {});
		await settled();
		expect(watchers.state('a')).toMatchObject({ version: 1, checking: false });
		watchers.changed('a');
		stop();
		release.resolve(null);
		await settled();
		expect(watchers.state('a')).toBeNull();
		expect(daemon.asked).toEqual(['a']);
	});

	it('asks how things stand upstream as of now when something may have happened there', async () => {
		const { watchers, daemon } = setup();
		watchers.watch('a', () => {});
		await settled();
		watchers.changed('a'); // files changed: what was learnt a moment ago will do
		watchers.refreshUpstream('a'); // an agent finished a turn: it may have opened a pull request
		await settled();
		expect(daemon.fresh).toEqual([false, false, true]);
	});

	it('publishes CI transitions to the sidebar, PR tab and ribbon on the same tick', async () => {
		let now = 0;
		const upstream: Upstream = {
			forge: 'github',
			repo: 'a/b',
			repoUrl: null,
			branch: 'remote-name',
			localBranch: 'geordi/w',
			pushed: true,
			createUrl: null,
			checkedAt: now,
			refreshAfterMs: 10_000,
			pull: {
				number: '1',
				title: 'Feature',
				body: '',
				url: null,
				state: 'open',
				draft: false,
				base: 'main',
				checks: null,
				review: null
			}
		};
		const { watchers, daemon } = setup(() => ({
			...answers(0),
			upstream: () => Promise.resolve(upstream)
		}));
		const stop = watchers.watch('a', () => {});
		await settled();
		const standings = createStandings({
			worktrees: () => ['a'],
			now: () => now,
			load: async () => {
				throw Error('Unexpected local scan');
			},
			loadUpstream: async () => ({
				...upstream,
				checkedAt: now,
				pull: {
					...upstream.pull!,
					checks: {
						state: now === 10_000 ? 'pending' : 'success',
						total: 1,
						failed: 0,
						url: null
					}
				}
			}),
			publishUpstream: watchers.noteUpstream
		});
		standings.note('a', watchers.state('a')!);
		now = 9000;
		standings.note('a', watchers.state('a')!); // a file edit returned a cached upstream read
		for (now of [10_000, 20_000]) {
			await standings.tick();
			const git = watchers.state('a')!;
			expect(git.upstream).toBe(standings.get('a')?.upstream);
			expect(git.upstream?.pull?.checks?.state).toBe(now === 10_000 ? 'pending' : 'success');
			expect(
				actionsFor({ ...git, failed: false, child: false }).some(
					(action) => action.id === 'merge-pull'
				)
			).toBe(now === 20_000);
		}
		watchers.noteUpstream('a', upstream); // late cached response
		watchers.noteUpstream('a', { ...upstream, checkedAt: now + 1, localBranch: 'old-branch' });
		expect(watchers.state('a')?.upstream?.checkedAt).toBe(20_000);
		expect(daemon.asked).toEqual(['a']);
		stop();
	});

	it('refreshes a minute after the last background update and cancels the fallback on close', async () => {
		vi.useFakeTimers();
		try {
			const { watchers, daemon } = setup();
			const stop = watchers.watch('a', () => {});
			await vi.advanceTimersByTimeAsync(1_000);
			watchers.noteUpstream('a', null, 'geordi/w');
			await vi.advanceTimersByTimeAsync(59_999);
			expect(daemon.fresh).toEqual([false]);
			await vi.advanceTimersByTimeAsync(1);
			expect(daemon.fresh).toEqual([false, true]);
			stop();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(daemon.fresh).toEqual([false, true]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('forgets a worktree nobody is looking at any more', async () => {
		const { watchers } = setup();
		const stop = watchers.watch('a', () => {});
		await settled();
		stop();
		expect(watchers.state('a')).toBeNull();
	});

	it('refuses unknown worktrees without breaking watching for everyone else', () => {
		const { watchers, sent, watching } = setup();
		expect(() => watchers.watch('missing', () => {})).toThrow();
		expect(sent).toEqual([]);

		watchers.watch('a', () => {});
		watchers.resync();
		expect(watching()).toEqual(['a']);
	});

	it('tells a reconnecting daemon what to watch, and asks it again', async () => {
		const { watchers, watching, sent, daemon } = setup();
		watchers.watch('a', () => {});
		await settled();
		watchers.resync();
		await settled();
		expect(sent).toHaveLength(2);
		expect(watching()).toEqual(['a']);
		expect(daemon.asked).toEqual(['a', 'a']);
	});
});
