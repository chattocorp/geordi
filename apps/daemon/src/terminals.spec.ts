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

	it('waits for Enter after a failed program that took the terminal over', async () => {
		// an interactive shell hands the terminal to a program it starts, and not back
		const { ended, exited, output } = run('t:c', `"${process.execPath}" -e "process.exit(1)"`);
		let gone = false;
		void exited.then(() => (gone = true));
		expect(await ended).toBe(1);
		await expect.poll(output).toContain('press Enter to close');
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(gone).toBe(false);
		writeTerminal('t:c', 'x');
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(gone).toBe(false);
		writeTerminal('t:c', '\r');
		await exited;
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

it('runs a complete block once and keeps the same interactive shell for typing', async () => {
	const previousShell = process.env.SHELL;
	process.env.SHELL = '/no-posix-login-shell';
	const id = 'workspace:block';
	let output = '';
	const options = {
		cols: 80,
		rows: 24,
		env: { GEORDI_PORT: '39001' },
		initialCommand: 'read marker <<EOF\nport=$GEORDI_PORT\nEOF\nprintf "first:%s\\n" "$marker"\n'
	};
	const open = () =>
		openTerminal(
			id,
			tmpdir(),
			options,
			() => {},
			(data) => (output += data),
			() => {}
		);
	open();
	try {
		await expect.poll(() => output).toContain('first:port=39001');
		open();
		writeTerminal(id, 'echo "again:$marker"\r');
		await expect.poll(() => output).toContain('again:port=39001');
		expect(output.match(/first:port=39001/g)).toHaveLength(1);
	} finally {
		closeTerminal(id);
		if (previousShell === undefined) delete process.env.SHELL;
		else process.env.SHELL = previousShell;
	}
});
