import { describe, expect, it } from 'vitest';
import { instructionsFor } from './instructions.ts';

const own = { parent: null, sharesWorktree: false, mayDelegate: true, named: false };

describe('instructionsFor', () => {
	it('tells an agent where it is, and how to hand work on', () => {
		const text = instructionsFor(own);
		expect(text).toContain('inside Geordi');
		expect(text).toContain('[Workspace title](/workspaces/<id>)');
		expect(text).toContain('a branch of its own');
		expect(text).toContain('`start_agent`');
		expect(text).toContain('model and reasoning effort');
		expect(text).toContain('`configuration_reference`');
		expect(text).toContain('`$GEORDI_PORT`');
		expect(text).toContain('`name_workspace`');
		expect(text).not.toContain('started by the agent');
	});

	it('tells an agent that an agent started who it works for', () => {
		const text = instructionsFor({ ...own, parent: { title: 'Speed up the tests' } });
		expect(text).toContain('started by the agent of another workspace ("Speed up the tests")');
		// started without a name, it is to find one itself; with one, it keeps it
		expect(text).toContain('`name_workspace`');
		const named = instructionsFor({ ...own, parent: { title: 'x' }, named: true });
		expect(named).not.toContain('`name_workspace`');
	});

	it('has an agent that an agent started ask that one, not the person', () => {
		const child = instructionsFor({ ...own, parent: { title: 'x' } });
		expect(child).toContain('do not use your blocking question tool');
		expect(instructionsFor(own)).toContain('use your blocking question tool and wait');
		// whoever starts agents learns to answer them
		expect(instructionsFor(own)).toContain('ends its turn with its question');
	});

	it('says so when the directory is shared, and when there is no delegating', () => {
		const text = instructionsFor({
			parent: { title: 'x' },
			sharesWorktree: true,
			mayDelegate: false,
			named: true
		});
		expect(text).toContain('sees and changes the same files');
		expect(text).toContain('cannot start further agents');
		expect(text).not.toContain('`start_agent`');
	});
});
