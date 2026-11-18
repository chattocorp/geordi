import { describe, expect, it } from 'vitest';
import type { TranscriptItem } from '#lib/server/workspaces.ts';
import { glimpseOf, plain } from './glimpse.ts';

const at = '2026-11-18T10:00:00Z';

describe('plain', () => {
	it('keeps the words of Markdown, in one line', () => {
		expect(plain('## Done\n\n- **Fixed** the [login](https://x.y)\n- `pnpm test` passes')).toBe(
			'Done Fixed the login pnpm test passes'
		);
	});

	it('leaves out code blocks and pictures', () => {
		expect(plain('Look:\n```ts\nconst a = 1;\n```\n![shot](/tmp/a.png) done')).toBe('Look: done');
	});

	it('cuts long text short', () => {
		expect(plain('word '.repeat(100), 20)).toHaveLength(20);
		expect(plain('word '.repeat(100), 20).endsWith('…')).toBe(true);
	});
});

describe('glimpseOf', () => {
	const transcript: TranscriptItem[] = [
		{ kind: 'user', text: 'Do it', at },
		{ kind: 'text', text: 'On it.', at },
		{
			kind: 'tool',
			id: 't',
			name: 'Bash',
			input: JSON.stringify({ command: 'pnpm test' }),
			output: null,
			isError: false,
			at
		}
	];

	it('says what the agent said last, and what it runs now', () => {
		const glimpse = glimpseOf(transcript, true);
		expect(glimpse.said).toBe('On it.');
		expect(glimpse.doing).toEqual({ icon: 'icon-[lucide--terminal]', text: 'pnpm test' });
		expect(glimpse.askedAt).toBe(at);
	});

	it('says the whole of a reply that came in pieces', () => {
		const pieces: TranscriptItem[] = [
			{ kind: 'text', text: 'Done. ', at },
			{ kind: 'text', text: 'All green.', at }
		];
		expect(glimpseOf(pieces, false).said).toBe('Done. All green.');
	});

	it('names the tool while what it runs on is still to come', () => {
		const starting = { ...transcript[2], input: '{}' } as TranscriptItem;
		expect(glimpseOf([starting], true).doing?.text).toBe('Bash');
	});

	it('runs nothing once the agent is at rest', () => {
		expect(glimpseOf(transcript, false).doing).toBeNull();
	});

	it('says what it asks, while the question is open', () => {
		const asking: TranscriptItem = {
			kind: 'question',
			id: 'q',
			questions: [{ question: 'Which colour?', options: [], multiSelect: false }],
			answers: null,
			open: true,
			at
		};
		expect(glimpseOf([...transcript, asking], true).asks).toBe('Which colour?');
		expect(glimpseOf([...transcript, { ...asking, open: false }], true).asks).toBeNull();
	});

	it('says what went wrong, if that is what happened last', () => {
		expect(glimpseOf([...transcript, { kind: 'error', error: 'Boom', at }], false).error).toBe(
			'Boom'
		);
	});
});
