import { describe, expect, it } from 'vitest';
import type { WorkspaceStanding } from '@geordi/ui/actions';
import { laneOf, lanes, type Sortable } from './overview.ts';

const standing = (tone: WorkspaceStanding['tone'], label = 'Something'): WorkspaceStanding => ({
	label,
	tone,
	icon: 'icon-[lucide--circle]'
});

const workspace = (over: Partial<Sortable> = {}): Sortable => ({
	id: 'w',
	working: false,
	outcome: 'completed',
	standing: null,
	updatedAt: '2026-11-18T10:00:00Z',
	...over
});

const none = new Set<string>();

describe('laneOf', () => {
	it('puts a question first, even while an agent works', () => {
		expect(laneOf(workspace({ working: true, outcome: 'asking' }), none)).toBe('attention');
	});

	it('puts work under way under working, though something is wrong', () => {
		expect(laneOf(workspace({ working: true, standing: standing('danger') }), none)).toBe(
			'working'
		);
	});

	it('wants the person for what is wrong, and for what they have not seen', () => {
		expect(laneOf(workspace({ standing: standing('danger') }), none)).toBe('attention');
		expect(laneOf(workspace(), new Set(['w']))).toBe('attention');
	});

	it('counts merged and closed as done', () => {
		expect(laneOf(workspace({ standing: standing('merged') }), none)).toBe('done');
		expect(laneOf(workspace({ standing: standing('neutral', 'Closed') }), none)).toBe('done');
	});

	it('leaves everything else open', () => {
		expect(laneOf(workspace(), none)).toBe('open');
		expect(laneOf(workspace({ standing: standing('ok') }), none)).toBe('open');
		expect(laneOf(workspace({ standing: standing('accent') }), none)).toBe('open');
	});
});

describe('lanes', () => {
	it('has every lane, each the latest first', () => {
		const old = workspace({ id: 'old', updatedAt: '2026-11-17T10:00:00Z' });
		const recent = workspace({ id: 'recent' });
		const result = lanes([old, recent], none);
		expect(result.open.map(({ id }) => id)).toEqual(['recent', 'old']);
		expect(result.working).toEqual([]);
		expect(result.done).toEqual([]);
		expect(result.attention).toEqual([]);
	});
});
