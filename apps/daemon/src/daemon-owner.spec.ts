import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { claimDaemon } from './daemon-owner.ts';

it('excludes a second follower and keeps the identity when ownership passes to a new process', () => {
	const dir = mkdtempSync(join(tmpdir(), 'geordi-owner-'));
	const first = claimDaemon(dir);
	try {
		expect(() => claimDaemon(dir)).toThrow('Cannot claim daemon ownership');
	} finally {
		first.close();
	}
	const next = claimDaemon(dir);
	try {
		expect(next.id).toBe(first.id);
	} finally {
		next.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
