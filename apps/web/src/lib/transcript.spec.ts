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
});
