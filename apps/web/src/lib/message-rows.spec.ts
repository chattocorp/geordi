import { expect, it } from 'vitest';
import { messageRows } from './message-rows.ts';
import type { Block } from './transcript.ts';

it('groups by child ID and adjacency, keeping queued messages individually addressable', () => {
	const message = (from: string, text: string): Block => ({ kind: 'user', from, text });
	const blocks: Block[] = [
		message('a', 'first'),
		message('a', 'second'),
		message('b', 'other'),
		message('a', 'next'),
		{ kind: 'agent', parts: [] },
		message('a', 'last')
	];
	const rows = messageRows(
		blocks,
		{ a: 'Review', b: 'Review' },
		['Your agent “Review” (a) finished its turn.\n\nDone.', 'Reminder'],
		['a', null],
		[[], []]
	);
	expect(
		rows.map((row) =>
			row.kind === 'child' ? row.messages.map((message) => message.text) : row.kind
		)
	).toEqual([['first', 'second'], ['other'], ['next'], 'block', ['last', 'Done.'], 'queue']);
	expect(rows[4]).toMatchObject({
		from: 'a',
		messages: [{ text: 'last' }, { report: 'finished', queued: { index: 0 } }]
	});
});
