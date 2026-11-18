import { expect, it, vi } from 'vitest';
import { BackgroundTasks } from './background-tasks.ts';

it('keeps terminal references local to their session and reads mirrored child snapshots', () => {
	const emit = vi.fn();
	const background = new BackgroundTasks(emit);
	const state = {
		state: 'running' as const,
		background: [{ type: 'terminal' as const, terminalId: 'term' }]
	};
	background.receive(undefined, {
		sessionUpdate: 'terminal_update',
		terminalId: 'term',
		command: 'root command'
	});
	background.receive(undefined, { sessionUpdate: 'subagent_update', sessionId: 'child', state });
	background.receive('child', {
		sessionUpdate: 'terminal_update',
		terminalId: 'term',
		command: 'child command'
	});
	background.receive('child', {
		sessionUpdate: 'tool_call_update',
		toolCallId: 'call',
		content: [{ type: 'terminal', terminalId: 'term' }]
	});
	expect(emit).toHaveBeenLastCalledWith([
		{ type: 'terminal', id: 'term', session: 'child', label: 'child command', toolCallId: 'call' }
	]);
	background.receive('child', { sessionUpdate: 'state_update', state: 'idle' });
	expect(emit).toHaveBeenLastCalledWith([]);
	expect(background.busy()).toBe(true);
	background.receive('child', { sessionUpdate: 'state_update', state: 'idle', background: [] });
	expect(background.busy()).toBe(false);
});
