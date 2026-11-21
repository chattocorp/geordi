import { describe, expect, it } from 'vitest';
import { toBlocks } from './transcript.ts';

const at = '2026-01-01T00:00:00Z';
const tool = (id: string) => ({
	kind: 'tool' as const,
	id,
	name: 'Bash',
	input: '',
	output: '',
	isError: false,
	at
});

describe('toBlocks', () => {
	it('gives a reply what its turn used, though a compaction follows it', () => {
		const usage = { totalTokens: 10, inputTokens: 8, outputTokens: 2 };
		expect(
			toBlocks([
				{ kind: 'text', text: 'Done.', at },
				{ kind: 'compaction', id: 'a', status: 'completed', at },
				{ kind: 'turn', usage, at }
			])
		).toEqual([
			{ kind: 'agent', parts: [{ kind: 'text', text: 'Done.' }], usage },
			{ kind: 'note', text: 'Compacted the conversation' }
		]);
	});

	it('says compactions in passing, between what the agent said', () => {
		const compaction = { kind: 'compaction' as const, at };
		expect(
			toBlocks([
				{ kind: 'text', text: 'Before.', at },
				{ ...compaction, id: 'a', status: 'completed', tokensBefore: 183000, tokensAfter: 21000 },
				{ ...compaction, id: 'b', status: 'completed' },
				{ ...compaction, id: 'c', status: 'failed' },
				{ ...compaction, id: 'd', status: 'running' }
			])
		).toEqual([
			{ kind: 'agent', parts: [{ kind: 'text', text: 'Before.' }] },
			{ kind: 'note', text: 'Compacted the conversation, 183k → 21k tokens' },
			{ kind: 'note', text: 'Compacted the conversation' },
			{ kind: 'note', text: 'Could not compact the conversation' },
			{ kind: 'note', text: 'Compacting the conversation', working: true }
		]);
	});

	it('groups agent output into turns and merges consecutive tool calls', () => {
		const blocks = toBlocks([
			{ kind: 'user', text: 'Do it', at },
			{ kind: 'text', text: 'On it.', at },
			tool('a'),
			tool('b'),
			{ kind: 'text', text: 'Done.', at },
			{ kind: 'user', text: 'Again', at },
			{ kind: 'error', error: 'Stopped', at }
		]);

		expect(blocks).toEqual([
			{ kind: 'user', text: 'Do it' },
			{
				kind: 'agent',
				parts: [
					{ kind: 'text', text: 'On it.' },
					{ kind: 'tools', tools: [tool('a'), tool('b')] },
					{ kind: 'text', text: 'Done.' }
				]
			},
			{ kind: 'user', text: 'Again' },
			{ kind: 'agent', parts: [{ kind: 'error', error: 'Stopped' }] }
		]);
	});

	it('keeps what is said in passing apart from what either side said', () => {
		const blocks = toBlocks([
			{ kind: 'user', text: 'Do it', at },
			{ kind: 'text', text: 'Done.', at },
			{ kind: 'note', text: 'Continued on a new branch, geordi/abc-2', at },
			{ kind: 'user', text: 'Now this', at }
		]);
		expect(blocks.map((block) => block.kind)).toEqual(['user', 'agent', 'note', 'user']);
	});

	it("adds up the usage and time of a reply's turns, and drops turns with no reply to go with", () => {
		const turn = (
			inputTokens: number,
			startedAt: string,
			end: string,
			cachedReadTokens?: number
		) => ({
			kind: 'turn' as const,
			startedAt,
			usage: {
				totalTokens: inputTokens + 10 + (cachedReadTokens ?? 0),
				inputTokens,
				outputTokens: 10,
				...(cachedReadTokens && { cachedReadTokens })
			},
			at: end
		});
		const blocks = toBlocks([
			turn(1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:01Z'),
			{ kind: 'user', text: 'Do it', at },
			{ kind: 'text', text: 'Started.', at },
			turn(5, '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z'),
			// a turn the agent began by itself, when something in the background ended
			{ kind: 'text', text: 'Finished.', at },
			turn(2, '2026-01-01T10:05:00Z', '2026-01-01T10:05:30Z', 100),
			// one from before turns said when they began
			{ kind: 'turn', at: '2026-01-01T10:06:00Z' }
		]);
		expect(blocks).toEqual([
			{ kind: 'user', text: 'Do it' },
			{
				kind: 'agent',
				parts: [
					{ kind: 'text', text: 'Started.' },
					{ kind: 'text', text: 'Finished.' }
				],
				usage: { totalTokens: 127, inputTokens: 7, outputTokens: 20, cachedReadTokens: 100 },
				took: 90_000
			}
		]);
	});
});

it('omits only standalone agent browser completion markers', () => {
	const marker = '::browser-complete{title="Checked browser session availability"}';
	expect(toBlocks([{ kind: 'text', text: marker, at }])).toEqual([]);
	for (const text of [`    ${marker}`, `Example: ${marker}`, '```\n' + marker + '\n```']) {
		expect(toBlocks([{ kind: 'text', text, at }])).toEqual([
			{ kind: 'agent', parts: [{ kind: 'text', text }] }
		]);
	}
	expect(toBlocks([{ kind: 'user', text: marker, at }])).toEqual([{ kind: 'user', text: marker }]);
});
