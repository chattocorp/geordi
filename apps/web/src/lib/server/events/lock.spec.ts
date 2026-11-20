import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const lock = join(import.meta.dirname, 'lock.ts');
/** A process that takes the data directory, says so, and then holds it. */
const script = (directory: string) =>
	`import { lockDataDirectory } from ${JSON.stringify(lock)};
	lockDataDirectory(${JSON.stringify(directory)});
	console.log('locked');
	setInterval(() => {}, 1000);`;
const tryLock = (directory: string) =>
	spawnSync(process.execPath, ['--input-type=module', '-e', script(directory)], {
		encoding: 'utf8',
		timeout: 3000
	});

describe('lockDataDirectory', () => {
	it('keeps a data directory to one process, until that process is gone', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'geordi-lock-'));
		const holder = spawn(process.execPath, ['--input-type=module', '-e', script(directory)]);
		await new Promise<void>((resolve, reject) => {
			holder.stdout.on('data', (data) => String(data).includes('locked') && resolve());
			holder.on('exit', () => reject(new Error('the first process could not take the lock')));
		});

		const second = tryLock(directory);
		expect(second.status).toBe(1);
		expect(second.stderr).toContain('Another Geordi is already running with the data in');

		// a crash lets go of it too
		holder.kill('SIGKILL');
		await new Promise((resolve) => holder.on('exit', resolve));
		expect(tryLock(directory).stdout).toContain('locked');
	});

	it('says what is wrong with a lock file that is no lock, instead of blaming another Geordi', () => {
		const directory = mkdtempSync(join(tmpdir(), 'geordi-lock-'));
		writeFileSync(
			join(directory, 'forge.lock'),
			'not a database, and much too long to be mistaken for one'
		);
		const attempt = tryLock(directory);
		expect(attempt.status).toBe(1);
		expect(attempt.stderr).toContain('file is not a database');
		expect(attempt.stderr).not.toContain('Another Geordi');
	});
});
