import type { ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { createTerminals } from './terminals.ts';

const at = { workspaceId: 'w', terminal: 't' };
const size = { cols: 100, rows: 30 };

function setup({ connected = true } = {}) {
	const sent: ForgeMessage[] = [];
	const terminals = createTerminals(
		(message) => (sent.push(message), connected),
		(workspaceId) => ({ workspaceId, repoPath: '/repo' })
	);
	return { terminals, sent, types: () => sent.map((message) => message.type) };
}

describe('terminals', () => {
	it('never starts a shell just because someone is watching', () => {
		const { terminals, sent } = setup();
		const seen: string[] = [];
		terminals.attach(at, (data) => seen.push(data));
		terminals.resize(at, size);

		expect(sent).toEqual([]);
		expect(seen.join('')).toContain('not running');
	});

	it('starts on request and relays output and input', () => {
		const { terminals, sent } = setup();
		const seen: string[] = [];
		const detach = terminals.attach(at, (data) => seen.push(data));
		seen.length = 0;

		terminals.start(at, size);
		expect(sent).toEqual([
			{ type: 'terminal.open', terminalId: 'w:t', workspaceId: 'w', repoPath: '/repo', ...size }
		]);

		terminals.output('w:t', 'hello');
		terminals.input(at, 'ls\r');
		expect(seen).toEqual(['hello']);
		expect(sent.at(-1)).toEqual({ type: 'terminal.input', terminalId: 'w:t', data: 'ls\r' });

		detach();
		terminals.output('w:t', ' world');
		expect(seen).toEqual(['hello']);
	});

	it('keeps the terminals of a workspace apart', () => {
		const { terminals } = setup();
		const seen: string[] = [];
		terminals.start(at, size);
		terminals.start({ ...at, terminal: 'other' }, size);
		terminals.attach(at, (data) => seen.push(data));
		terminals.output('w:other', 'elsewhere');
		expect(seen).toEqual([]);
	});

	it('replays recent output to viewers that connect later', () => {
		const { terminals } = setup();
		terminals.start(at, size);
		terminals.output('w:t', 'one');
		terminals.output('w:t', 'two');

		const seen: [string, boolean][] = [];
		terminals.attach(at, (...args) => seen.push(args));
		terminals.output('w:t', 'three');
		expect(seen).toEqual([
			['onetwo', true],
			['three', false]
		]);
	});

	it('restarts an exited shell on the next key press, at its last size', () => {
		const { terminals, sent, types } = setup();
		terminals.start(at, size);
		terminals.exit('w:t');
		terminals.resize(at, { cols: 50, rows: 10 });
		terminals.input(at, 'x');
		expect(types()).toEqual(['terminal.open', 'terminal.open']);
		expect(sent.at(-1)).toMatchObject({ cols: 50, rows: 10 });
	});

	it('ends the shell when the terminal is closed', () => {
		const { terminals, sent } = setup();
		terminals.start(at, size);
		terminals.close(at);
		expect(sent.at(-1)).toEqual({ type: 'terminal.close', terminalId: 'w:t' });
	});

	it('says so when no daemon is connected', () => {
		const { terminals } = setup({ connected: false });
		const seen: string[] = [];
		terminals.attach(at, (data) => seen.push(data));
		terminals.start(at, size);
		expect(seen.join('')).toContain('No daemon connected');
	});
});
