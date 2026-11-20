import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeTerminal, hasTerminalActivity, openTerminal, writeTerminal } from './terminals.ts';

describe('a command in a terminal', () => {
	/** Runs `command` in a terminal, in a plain shell; resolves when the command has ended. */
	function run(id: string, command: string, closeOnSuccess = false) {
		process.env.SHELL = '/bin/sh';
		const cwd = mkdtempSync(join(tmpdir(), 'geordi-terminal-'));
		let output = '';
		const exited = Promise.withResolvers<void>();
		const ended = new Promise<number | null>((resolve) =>
			openTerminal(
				id,
				cwd,
				{ cols: 80, rows: 24, command, closeOnSuccess, env: { WHO: 'geordi' }, onEnded: resolve },
				() => {},
				(data) => (output += data),
				exited.resolve
			)
		);
		return { ended, exited: exited.promise, output: () => output };
	}

	it('says when the command has ended, and how, while its output stays to be read', async () => {
		const { ended, output } = run('t:a', 'echo "hi $WHO"; exit 3', true);
		expect(await ended).toBe(3);
		expect(await hasTerminalActivity('t')).toBe(false);
		expect(output()).toContain('hi geordi');
		await expect.poll(output).toContain('ended with status 3');
		closeTerminal('t:a');
	});

	it('closes after a successful setup without waiting for input', async () => {
		const { ended, exited, output } = run('t:setup', 'echo ready', true);
		expect(await ended).toBe(0);
		await exited;
		expect(output()).toContain('ready');
		expect(output()).not.toContain('press Enter');
	});

	it('says so when the terminal is closed before the command ends', async () => {
		const { ended } = run('t:b', 'sleep 30');
		expect(await hasTerminalActivity('t')).toBe(true);
		setTimeout(() => closeTerminal('t:b'), 300);
		expect(await ended).toBeNull();
	});
});

it('distinguishes an idle shell from foreground and background processes on archive', async () => {
	const id = 'workspace:shell';
	process.env.SHELL = '/bin/sh';
	openTerminal(
		id,
		tmpdir(),
		{ cols: 80, rows: 24 },
		() => {},
		() => {},
		() => {}
	);
	try {
		await expect.poll(() => hasTerminalActivity('workspace')).toBe(false);
		writeTerminal(id, 'sleep 30\r');
		await expect.poll(() => hasTerminalActivity('workspace')).toBe(true);
		writeTerminal(id, '\x03');
		await expect.poll(() => hasTerminalActivity('workspace')).toBe(false);
		writeTerminal(id, 'sleep 30 &\r');
		await expect.poll(() => hasTerminalActivity('workspace')).toBe(true);
		expect(await hasTerminalActivity('other')).toBe(false);
		writeTerminal(id, 'kill $!\r');
		await expect.poll(() => hasTerminalActivity('workspace')).toBe(false);
		writeTerminal(id, 'exec sleep 30\r');
		await expect.poll(() => hasTerminalActivity('workspace')).toBe(true);
	} finally {
		closeTerminal(id);
	}
});
