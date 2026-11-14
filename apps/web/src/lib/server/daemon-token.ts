import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Reads the shared secret daemons must present, creating it (readable only by the current
 * user) on first use. Daemons on the same machine read the same file.
 */
export function loadDaemonToken(path: string): string {
	if (!existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
	}
	return readFileSync(path, 'utf8').trim();
}

export function tokensMatch(expected: string, actual: unknown): boolean {
	if (typeof actual !== 'string') return false;
	const a = Buffer.from(expected);
	const b = Buffer.from(actual);
	return a.length === b.length && timingSafeEqual(a, b);
}
