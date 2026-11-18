import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from './git.ts';

it('keeps servicing timers and kills a stalled git, naming its command', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'geordi-stalled-'));
	try {
		writeFileSync(join(dir, 'git'), '#!/bin/sh\necho $$ > pid\nexec sleep 60\n', { mode: 0o700 });
		let ticked = false;
		const operation = git(dir, ['status'], {
			env: { ...process.env, PATH: dir + ':' + process.env.PATH },
			timeout: 200
		});
		const timer = setTimeout(() => {
			ticked = true;
		}, 10);
		await expect(operation).rejects.toThrow('git status timed out after 200 ms');
		clearTimeout(timer);
		expect(ticked).toBe(true);
		expect(() => process.kill(Number(readFileSync(join(dir, 'pid'), 'utf8')), 0)).toThrow(/ESRCH/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
