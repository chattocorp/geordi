import type { ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { createWatchers } from './watchers.ts';

function setup() {
	const sent: ForgeMessage[] = [];
	const watchers = createWatchers(
		(message) => (sent.push(message), true),
		(workspaceId) => ({ workspaceId, repoPath: '/repo' })
	);
	/** The workspaces the daemon was last told to watch. */
	const watching = () => {
		const last = sent.at(-1);
		return last?.type === 'watch' ? last.workspaces.map((ref) => ref.workspaceId) : null;
	};
	return { watchers, sent, watching };
}

describe('watchers', () => {
	it('has the daemon watch a workspace from its first viewer to its last', () => {
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

	it('tells the viewers of a workspace when it changed, and nobody else', () => {
		const { watchers } = setup();
		const seen: string[] = [];
		watchers.watch('a', () => seen.push('a1'));
		watchers.watch('a', () => seen.push('a2'));
		const stop = watchers.watch('b', () => seen.push('b'));
		const before = watchers.revision();

		watchers.changed('a');
		expect(seen).toEqual(['a1', 'a2']);
		expect(watchers.revision()).not.toBe(before);

		stop();
		watchers.changed('b');
		watchers.changed('unknown');
		expect(seen).toEqual(['a1', 'a2']);
	});

	it('tells a reconnecting daemon what to watch', () => {
		const { watchers, watching, sent } = setup();
		watchers.watch('a', () => {});
		watchers.resync();
		expect(sent).toHaveLength(2);
		expect(watching()).toEqual(['a']);
	});
});
