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
		expect(text).toContain('do as they ask');
		expect(text).not.toContain('never a default');
		expect(text).toContain('`name_workspace`');
		expect(text).not.toContain('reports to the agent');
	});

	it('tells an agent that an agent started who it works for', () => {
		const text = instructionsFor({ ...own, parent: { title: 'Speed up the tests' } });
		expect(text).toContain('reports to the agent of another workspace ("Speed up the tests")');
		// started without a name, it is to find one itself; with one, it keeps it
		expect(text).toContain('`name_workspace`');
		const named = instructionsFor({ ...own, parent: { title: 'x' }, named: true });
		expect(named).not.toContain('`name_workspace`');
	});

	it('shows an agent the items under its workspace, to keep (FDR-019)', () => {
		const text = instructionsFor({
			...own,
			outline: {
				workspace: 'Bump the protocol',
				path: ['Release 0.9'],
				items: [
					{ id: 'a', text: 'Update the daemon', done: true, depth: 0 },
					{
						id: 'b',
						text: 'In the tests too',
						done: false,
						depth: 1,
						note: 'The live ones.\nAll of them.'
					},
					{ id: 'c', agent: 'Review', done: false, depth: 0, itemsDone: 1, itemsTotal: 2 }
				]
			}
		});
		expect(text).toContain('your workspace "Bump the protocol" is part of "Release 0.9"');
		expect(text).toContain('- [x] Update the daemon (item a)\n  - [ ] In the tests too (item b)');
		// an item's note under it, as written
		expect(text).toContain('(item b)\n    The live ones.\n    All of them.\n');
		expect(text).toContain('- Agent "Review": 1 of 2 of its own items done');
		expect(text).toContain('`update_item`');
		// the plan is written there before any work that changes something
		expect(text).toContain('write your plan here first');
		expect(text).toContain('instead of a todo list of your own');
		expect(instructionsFor(own)).not.toContain('`update_item`');
	});

	it('has an agent that an agent started ask that one, not the person', () => {
		const child = instructionsFor({ ...own, parent: { title: 'x' } });
		expect(child).toContain('Use your blocking question tool to ask the agent');
		expect(instructionsFor(own)).toContain('use your blocking question tool and wait');
		// whoever starts agents learns to answer them
		expect(instructionsFor(own)).toContain('use forward_question');
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
