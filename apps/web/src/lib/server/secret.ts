import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Reads a secret from a file, creating it (readable only by the current user) on first use.
 * Used for the token daemons must present (daemons on the same machine read the same file)
 * and for the key that signs agent API tokens.
 */
export function loadSecret(path: string): string {
	if (!existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
	}
	return readFileSync(path, 'utf8').trim();
}
