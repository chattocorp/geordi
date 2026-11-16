import type { ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { createWatchers, type WorktreeState } from './watchers.ts';

/** Lets pending loads settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve));

const stateWith = (uncommitted: number): WorktreeState => ({
	changes: { files: [], uncommitted, unpushed: null },
	unavailable: null,
	missing: false,
	config: null,
	release: null,
	upstream: null
});

function setup() {
	const sent: ForgeMessage[] = [];
	/** What the daemon would say about each worktree, and how often it was asked. */
	const daemon = { uncommitted: 0, asked: [] as string[], fresh: [] as boolean[] };
	const watchers = createWatchers(
		(message) => (sent.push(message), true),
		(worktreeId) => {
			if (worktreeId === 'missing') throw new Error('Workspace missing not found');
			return { worktreeId, repoPath: '/repo' };
		},
		async (worktreeId, fresh) => {
			daemon.asked.push(worktreeId);
			daemon.fresh.push(fresh);
			return stateWith(daemon.uncommitted);
		}
	);
	/** The worktrees the daemon was last told to watch. */
	const watching = () => {
		const last = sent.at(-1);
		return last?.type === 'watch' ? last.worktrees.map((ref) => ref.worktreeId) : null;
	};
	return { watchers, sent, watching, daemon };
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
		expect(seen).toEqual(['a1', 'a2', 'b']);

		daemon.uncommitted = 2;
		watchers.changed('a');
		watchers.changed('unknown');
		await settled();
		expect(daemon.asked).toEqual(['a', 'b', 'a']);
		expect(watchers.state('a')).toMatchObject(stateWith(2));
		expect(watchers.state('b')).toMatchObject(stateWith(0));
		// each look at a worktree is told apart from the one before, as the cue to load diffs again
		expect(watchers.state('a')!.version).toBeGreaterThan(watchers.state('b')!.version);
		expect(seen).toEqual(['a1', 'a2', 'b', 'a1', 'a2']);
	});

	it('asks how things stand upstream as of now when something may have happened there', async () => {
		const { watchers, daemon } = setup();
		watchers.watch('a', () => {});
		await settled();
		watchers.changed('a'); // files changed: what was learnt a moment ago will do
		watchers.changed('a', true); // an agent finished a turn: it may have opened a pull request
		await settled();
		expect(daemon.fresh).toEqual([false, false, true]);
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
