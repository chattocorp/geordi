import type { AgentEvent } from '@geordi/protocol';
import { expect, it } from 'vitest';
import { recapActivity } from './recap.ts';
import type { StoredEvent, GeordiEvent } from './events/index.ts';

function output(event: AgentEvent, seq: number): StoredEvent<GeordiEvent> {
	return {
		seq,
		type: 'workspace.output',
		stream: 'workspace:w',
		actor: null,
		at: 'now',
		data: { id: 'w', event }
	};
}

it('keeps the outcome and closing question of a long final reply within its excerpt budget', () => {
	const decision = 'Expose farewell in the CLI or change the release note?';
	const text = 'Both tests pass. ' + 'Long explanation. '.repeat(90) + decision;
	const [line] = recapActivity([output({ kind: 'text', text }, 1)], []).split('\n');
	expect(line).toMatch(/^now text Both tests pass/);
	expect(line.endsWith(decision)).toBe(true);
	expect(line.length).toBeLessThanOrEqual('now '.length + 600);
});

it('keeps the last completed reply when tool updates push it out of the event window', () => {
	const tool = { kind: 'tool.update', id: 'build', title: 'Build progress' } as const;
	const events: AgentEvent[] = [
		...Array(10).fill(tool),
		{ kind: 'text', text: 'The build passed. Ship today?' },
		{ kind: 'turn.completed' },
		{ kind: 'turn.started' },
		{ kind: 'text', text: 'Checking again.' },
		...Array(50).fill(tool)
	];
	const recap = recapActivity(events.map(output), []);
	expect(recap.match(/The build passed\. Ship today\?/g)).toHaveLength(1);
	expect(recap.split('\n')).toHaveLength(42);
});
