import { describe, expect, it } from 'vitest';
import { instructionsFor } from './instructions.ts';

const own = { parent: null, sharesWorktree: false, mayDelegate: true };

describe('instructionsFor', () => {
	it('tells an agent where it is, and how to hand work on', () => {
		const text = instructionsFor(own);
		expect(text).toContain('inside Geordi');
		expect(text).toContain('a branch of its own');
		expect(text).toContain('`start_agent`');
		expect(text).toContain('`configuration_reference`');
		expect(text).not.toContain('started by the agent');
	});

	it('tells an agent that an agent started who it works for', () => {
		const text = instructionsFor({ ...own, parent: { title: 'Speed up the tests' } });
		expect(text).toContain('started by the agent of another workspace ("Speed up the tests")');
	});

	it('says so when the directory is shared, and when there is no delegating', () => {
		const text = instructionsFor({
			parent: { title: 'x' },
			sharesWorktree: true,
			mayDelegate: false
		});
		expect(text).toContain('sees and changes the same files');
		expect(text).toContain('cannot start further agents');
		expect(text).not.toContain('`start_agent`');
	});
});
