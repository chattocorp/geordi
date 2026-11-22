import { describe, expect, it } from 'vitest';
import { MAX_TEXT, PAGE_CHARS, pageOf, turnsOf, type Turn } from './turns.ts';
import type { TranscriptItem } from './workspace-projection.ts';

const at = '2026-11-22T00:00:00.000Z';

describe('turnsOf', () => {
	it('keeps the message and the last reply of each turn', () => {
		const transcript: TranscriptItem[] = [
			{ kind: 'user', text: 'Fix it', at, from: 'parent' },
			{ kind: 'text', text: 'Let me look', at },
			{ kind: 'tool', id: 't', name: 'Read', input: '', output: '', isError: false, at },
			{ kind: 'text', text: 'Fixed', at },
			{ kind: 'turn', at },
			{ kind: 'user', text: 'Push it', at },
			{ kind: 'error', error: 'Stopped', at },
			{ kind: 'turn', at }
		];
		expect(turnsOf(transcript)).toEqual([
			{ at, message: 'Fix it', from: 'parent', reply: 'Fixed', error: null },
			{ at, message: 'Push it', reply: '', error: 'Stopped' }
		]);
	});

	it('gives a turn the agent began itself no message', () => {
		const transcript: TranscriptItem[] = [
			{ kind: 'user', text: 'Run the tests in the background', at },
			{ kind: 'text', text: 'Started', at },
			{ kind: 'turn', at },
			{ kind: 'text', text: 'They passed', at },
			{ kind: 'turn', at }
		];
		expect(turnsOf(transcript).map((t) => [t.message, t.reply])).toEqual([
			['Run the tests in the background', 'Started'],
			[null, 'They passed']
		]);
	});
});

describe('pageOf', () => {
	const turn = (reply: string): Turn => ({ at, message: 'Go', reply, error: null });

	it('pages back from the newest turn', () => {
		const turns = Array.from({ length: 60 }, (_, i) => turn(String(i)));
		const latest = pageOf(turns);
		expect(latest.turns).toHaveLength(50);
		expect(latest.turns.at(-1)?.reply).toBe('59');
		expect(latest.before).toBe(10);
		expect(pageOf(turns, latest.before!)).toMatchObject({ before: null, turns: { length: 10 } });
	});

	it('stays within its size, but always gives one turn', () => {
		const turns = Array.from({ length: 10 }, () => turn('x'.repeat(MAX_TEXT)));
		const page = pageOf(turns);
		expect(page.turns.length).toBeLessThan(10);
		expect(JSON.stringify(page.turns).length).toBeLessThanOrEqual(PAGE_CHARS);

		const huge = pageOf([turn('y'.repeat(PAGE_CHARS * 2) + 'the end')]);
		expect(huge.turns).toHaveLength(1);
		expect(huge.turns[0].reply).toMatch(/^\(\d+ earlier characters left out\) …y+the end$/);
		expect(huge.turns[0].reply.length).toBeLessThan(MAX_TEXT + 100);
	});
});
