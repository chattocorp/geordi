import type { ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { createTerminals } from './terminals.ts';

function setup({ connected = true } = {}) {
	const sent: ForgeMessage[] = [];
	const terminals = createTerminals(
		(message) => (sent.push(message), connected),
		(workspaceId) => ({ workspaceId, repoPath: '/repo' })
	);
	return { terminals, sent };
}

describe('terminals', () => {
	it('starts the shell on attach and relays output and input', () => {
		const { terminals, sent } = setup();
		const seen: string[] = [];
		const detach = terminals.attach('w', { cols: 100, rows: 30 }, (data) => seen.push(data));

		expect(sent).toEqual([
			{ type: 'terminal.open', workspaceId: 'w', repoPath: '/repo', cols: 100, rows: 30 }
		]);

		terminals.output('w', 'hello');
		terminals.input('w', 'ls\r');
		expect(seen).toEqual(['hello']);
		expect(sent.at(-1)).toEqual({ type: 'terminal.input', workspaceId: 'w', data: 'ls\r' });

		detach();
		terminals.output('w', ' world');
		expect(seen).toEqual(['hello']);
	});

	it('replays recent output to viewers that connect later', () => {
		const { terminals } = setup();
		terminals.attach('w', { cols: 80, rows: 24 }, () => {});
		terminals.output('w', 'one');
		terminals.output('w', 'two');

		const seen: [string, boolean][] = [];
		terminals.attach('w', { cols: 80, rows: 24 }, (...args) => seen.push(args));
		terminals.output('w', 'three');
		expect(seen).toEqual([
			['onetwo', true],
			['three', false]
		]);
	});

	it('restarts an exited shell on the next key press', () => {
		const { terminals, sent } = setup();
		terminals.attach('w', { cols: 80, rows: 24 }, () => {});
		terminals.exit('w');
		terminals.input('w', 'x');
		expect(sent.map((message) => message.type)).toEqual(['terminal.open', 'terminal.open']);
	});

	it('says so when no daemon is connected', () => {
		const { terminals } = setup({ connected: false });
		const seen: string[] = [];
		terminals.attach('w', { cols: 80, rows: 24 }, (data) => seen.push(data));
		expect(seen.join('')).toContain('No daemon connected');
	});
});
