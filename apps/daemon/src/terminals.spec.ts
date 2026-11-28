import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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

it.each(['false', 'sleep 100', 'exit 7'])(
	'prints the literal block before its output and handles a final %s',
	async (lastCommand) => {
		const id = `workspace:${lastCommand}`;
		const directory = mkdtempSync(join(tmpdir(), 'geordi-shell-test-'));
		vi.stubEnv('TMPDIR', directory);
		vi.stubEnv('SHELL', '/bin/bash');
		const initialCommand = [
			'cd /',
			'read marker <<EOF',
			'port=$GEORDI_PORT',
			'EOF',
			'export marker',
			'printf \'first:%s\\n\' "$marker"',
			lastCommand
		].join('\n');
		const options = { cols: 80, rows: 24, env: { GEORDI_PORT: '39001' }, initialCommand };
		let output = '';
		const exited = Promise.withResolvers<void>();
		const open = () =>
			openTerminal(
				id,
				directory,
				options,
				() => {},
				(data) => (output += data),
				exited.resolve
			);
		try {
			open();
			await expect.poll(() => output).toContain('first:port=39001');
			expect(
				output.startsWith(
					'\x1b[2m' + initialCommand.replaceAll('\n', '\r\n') + '\x1b[0m\r\nfirst:port=39001'
				)
			).toBe(true);
			if (lastCommand === 'exit 7') {
				await exited.promise;
			} else {
				if (lastCommand === 'sleep 100') {
					await expect.poll(() => hasTerminalActivity('workspace')).toBe(true);
					writeTerminal(id, '\x03');
				}
				await expect.poll(() => hasTerminalActivity('workspace')).toBe(false);
				open(); // resizing an existing terminal must not repeat its block
				writeTerminal(id, 'echo "next:$0:$PWD:$marker:${ENV-unset}"\r');
				await expect.poll(() => output).toContain('next:/bin/bash:/:port=39001:unset');
				expect(output.match(/first:port=39001/g)).toHaveLength(1);
			}
			expect(readdirSync(directory).filter((name) => name.startsWith('geordi-shell-'))).toEqual([]);
		} finally {
			closeTerminal(id);
			await exited.promise;
			vi.unstubAllEnvs();
			rmSync(directory, { recursive: true, force: true });
		}
	}
);
