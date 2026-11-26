import { describe, expect, it } from 'vitest';
import { applyItem, attach, emptyOutline, move, outlineView } from './items.ts';

describe('the outline’s order', () => {
	it('leaves an item where it is when it is moved above one that is gone, as workspaces always were', () => {
		const outline = emptyOutline();
		for (const id of ['a', 'b', 'c']) attach(outline, id, null);
		expect(outline.order).toEqual(['c', 'b', 'a']);
		move(outline, 'a', 'gone');
		expect(outline.order).toEqual(['c', 'b', 'a']);
		move(outline, 'a', 'c');
		expect(outline.order).toEqual(['a', 'c', 'b']);
		move(outline, 'a', null);
		expect(outline.order).toEqual(['c', 'b', 'a']);
	});
});

describe('the outline as people see it', () => {
	it('keeps archived work as a record in a tree in use, and lets archived trees go', () => {
		const outline = emptyOutline();
		// a tree that was archived, with work that carries on under it, and a todo
		attach(outline, 'old', null);
		attach(outline, 'old-child', 'old');
		attach(outline, 'carries-on', 'old');
		applyItem(outline, {
			type: 'item.created',
			stream: 'item:todo',
			data: { id: 'todo', parentId: 'old', before: null, text: 'Leftover' }
		});
		// a lead in use, with a child archived under it
		attach(outline, 'lead', null);
		attach(outline, 'done-child', 'lead');
		const archived = new Set(['old', 'old-child', 'done-child']);
		const view = outlineView(
			outline,
			(id) => ({ title: id, worktreeId: id, archivedAt: archived.has(id) ? 'yesterday' : null }),
			() => undefined
		);
		expect(view.map(({ id, parentId, done }) => [id, parentId, done])).toEqual([
			['done-child', 'lead', true],
			['lead', null, false],
			['carries-on', null, false]
		]);
	});
});
