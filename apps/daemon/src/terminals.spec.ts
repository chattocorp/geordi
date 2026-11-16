import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeTerminal, openTerminal } from './terminals.ts';

describe('a command in a terminal', () => {
	/** Runs `command` in a terminal, in a plain shell; resolves when the command has ended. */
	function run(id: string, command: string) {
		process.env.SHELL = '/bin/sh';
		const cwd = mkdtempSync(join(tmpdir(), 'geordi-terminal-'));
		let output = '';
		const ended = new Promise<number | null>((resolve) =>
			openTerminal(
				id,
				cwd,
				{ cols: 80, rows: 24, command, env: { WHO: 'geordi' }, onEnded: resolve },
				() => {},
				(data) => (output += data),
				() => {}
			)
		);
		return { ended, output: () => output };
	}

	it('says when the command has ended, and how, while its output stays to be read', async () => {
		const { ended, output } = run('t:a', 'echo "hi $WHO"; exit 3');
		expect(await ended).toBe(3);
		expect(output()).toContain('hi geordi');
		expect(output()).toContain('ended with status 3');
		closeTerminal('t:a');
	});

	it('says so when the terminal is closed before the command ends', async () => {
		const { ended } = run('t:b', 'sleep 30');
		setTimeout(() => closeTerminal('t:b'), 300);
		expect(await ended).toBeNull();
	});
});
