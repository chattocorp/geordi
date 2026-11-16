import { describe, expect, it } from 'vitest';
import { setupNote } from './scripts.ts';

describe('setupNote', () => {
	const setup = { command: 'pnpm install', approved: true };

	it('says nothing where there is nothing to say', () => {
		expect(setupNote(null, null)).toBeNull();
		expect(setupNote(setup, { status: 0, output: 'done' })).toBeNull();
	});

	it('tells the agent what did not run, what was stopped, and what failed with what output', () => {
		expect(setupNote({ ...setup, approved: false }, null)).toMatch(
			/`pnpm install`.*did not run.*not agreed/
		);
		expect(setupNote(setup, { status: null, output: '' })).toMatch(/stopped before it finished/);

		const failed = setupNote(setup, {
			status: 1,
			output:
				'\x1b[31mERR_PNPM_NO_LOCKFILE\x1b[0m\r\nnope\r\n\x1b]7717;1\x07\r\n\x1b[2m[ended with status 1; press Enter to close]'
		});
		expect(failed).toMatch(/failed, with status 1/);
		expect(failed).toContain('```\nERR_PNPM_NO_LOCKFILE\nnope\n```');
	});
});
