import type { Changes, ForgeMessage, ReleasePlan, Upstream } from '@geordi/protocol';
import { actionsFor } from '@geordi/ui/actions';
import { describe, expect, it } from 'vitest';
import { createStandings } from './standings.ts';
import { createWatchers } from './watchers.ts';

/** Lets pending loads settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve));

const changes = (uncommitted = 0): Changes => ({
	branch: 'geordi/w',
	files: [],
	uncommitted,
	unpushed: null,
	landed: false
});

const pulled: Upstream = {
	forge: 'github',
	repo: 'a/b',
	repoUrl: null,
	branch: 'remote-name',
	localBranch: 'geordi/w',
	pushed: true,
	createUrl: null,
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

function setup() {
	const sent: ForgeMessage[] = [];
	/** What the daemon would say about each worktree, and what it was asked. */
	const daemon = {
		now: 0,
		uncommitted: 0,
		upstream: null as Upstream | null,
		release: null as ReleasePlan | null,
		asked: [] as string[],
		/** Release plans held back until released. */
		held: [] as (() => void)[],
		hold: false
	};
	const standings = createStandings({
		worktrees: () => watchers.ids(),
		loadLocal: async (id) => {
			daemon.asked.push(id);
			return { changes: changes(daemon.uncommitted), unavailable: null, missing: false };
		},
		loadUpstream: async (id, fresh) => {
			daemon.asked.push(`${id} upstream${fresh ? '!' : ''}`);
			return daemon.upstream && { ...daemon.upstream, checkedAt: daemon.now };
		},
		open: (id) => watchers.isWatched(id),
		now: () => daemon.now
	});
	const watchers = createWatchers(
		(message) => (sent.push(message), true),
		(worktreeId) => {
			if (worktreeId === 'missing') throw new Error('Workspace missing not found');
			return { worktreeId, repoPath: '/repo' };
		},
		standings,
		(id) => {
			daemon.asked.push(`${id} details`);
			const release = daemon.release;
			return {
				config: Promise.resolve(null),
				release: daemon.hold
					? new Promise((resolve) => daemon.held.push(() => resolve(release)))
					: Promise.resolve(release)
			};
		}
	);
	/** The worktrees the daemon was last told to watch. */
	const watching = () => {
		const last = sent.at(-1);
		return last?.type === 'watch' ? last.worktrees.map((ref) => ref.worktreeId) : null;
	};
	return { watchers, standings, sent, watching, daemon };
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
		expect(watchers.state('a')).toBeNull();
		other();
		expect(watching()).toEqual([]);
	});

	it('shows what the sidebar knew at once, and looks again for whoever opens it', async () => {
		const { watchers, standings, daemon } = setup();
		daemon.upstream = pulled;
		// known from the background, before anyone opens it
		await standings.look('a');
		daemon.asked = [];

		const seen: number[] = [];
		const close = watchers.watch('a', () => seen.push(watchers.state('a')!.version));
		expect(watchers.state('a')).toMatchObject({
			checking: false,
			version: 1,
			upstream: { pull: { number: '1' } },
			releasePending: true
		});
		await settled();
		// its files, its pull request with each check, and its details: each asked once
		expect(daemon.asked.toSorted()).toEqual(['a', 'a details', 'a upstream']);
		expect(watchers.state('a')).toMatchObject({ version: 2, releasePending: false });
		expect(seen.at(-1)).toBe(2);
		close();
	});

	it('is checking until both local Git and the forge have answered', async () => {
		const { watchers } = setup();
		watchers.watch('a', () => {});
		expect(watchers.state('a')).toMatchObject({ checking: true, changes: null, version: 0 });
		await settled();
		expect(watchers.state('a')).toMatchObject({ checking: false, version: 1 });
	});

	it('loads the details once for everyone looking, and again when the files changed', async () => {
		const { watchers, standings, daemon } = setup();
		const seen: string[] = [];
		watchers.watch('a', () => seen.push('a1'));
		watchers.watch('a', () => seen.push('a2'));
		await settled();
		expect(daemon.asked.filter((asked) => asked === 'a details')).toHaveLength(1);
		expect(seen).toContain('a1');
		expect(seen).toContain('a2');

		// a slow release plan never keeps changed files from showing
		daemon.hold = true;
		daemon.release = { packages: [] } as unknown as ReleasePlan;
		daemon.uncommitted = 1;
		standings.changed('a');
		await settled();
		daemon.uncommitted = 2;
		standings.changed('a');
		await settled();
		expect(watchers.state('a')).toMatchObject({ changes: { uncommitted: 2 }, release: null });
		expect(daemon.asked.filter((asked) => asked === 'a details')).toHaveLength(2);
		// one load at a time; what changed meanwhile is loaded for afterwards
		daemon.hold = false;
		daemon.held.splice(0).forEach((release) => release());
		await settled();
		expect(daemon.asked.filter((asked) => asked === 'a details')).toHaveLength(3);
		expect(watchers.state('a')?.release).toEqual({ packages: [] });
	});

	it('drops late answers after the last viewer leaves', async () => {
		const { watchers, daemon } = setup();
		daemon.hold = true;
		let told = 0;
		const close = watchers.watch('a', () => told++);
		await settled();
		close();
		const before = told;
		daemon.held.splice(0).forEach((release) => release());
		await settled();
		expect(told).toBe(before);
		expect(watchers.state('a')).toBeNull();
	});

	it('shows CI transitions in the sidebar, the PR tab and the ribbon from the same answer', async () => {
		const { watchers, standings, daemon } = setup();
		daemon.upstream = pulled;
		const stop = watchers.watch('a', () => {});
		await settled();
		daemon.asked = [];
		for (daemon.now of [10_000, 20_000]) {
			const state = daemon.now === 10_000 ? 'pending' : 'success';
			daemon.upstream = {
				...pulled,
				pull: { ...pulled.pull!, checks: { state, total: 1, failed: 0, url: null } }
			};
			await standings.tick();
			const git = watchers.state('a')!;
			expect(git.upstream).toBe(standings.get('a')?.upstream);
			expect(git.upstream?.pull?.checks?.state).toBe(state);
			expect(
				actionsFor({ ...git, failed: false, child: false }).some(
					(action) => action.id === 'merge-pull'
				)
			).toBe(state === 'success');
		}
		// no local Git, and no details, for what only the forge knows
		expect(daemon.asked).toEqual(['a upstream', 'a upstream']);
		stop();
	});

	it('refuses unknown worktrees without breaking watching for everyone else', () => {
		const { watchers, watching } = setup();
		expect(() => watchers.watch('missing', () => {})).toThrow('not found');
		expect(watchers.isWatched('missing')).toBe(false);
		watchers.watch('a', () => {});
		expect(watching()).toEqual(['a']);
	});

	it('tells a reconnecting daemon what to watch', () => {
		const { watchers, sent, watching } = setup();
		watchers.watch('a', () => {});
		watchers.resync();
		expect(sent).toHaveLength(2);
		expect(watching()).toEqual(['a']);
	});
});
