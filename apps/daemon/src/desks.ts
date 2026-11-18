import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where a desk's agent works (FDR-012): an empty folder of its own, derived from the desk's
 * ID, and no Git repository. Made when its agent first starts, removed with the desk.
 */
export function deskPath(desksDir: string, deskId: string): string {
	// it names a folder that is removed with everything in it: nothing but an ID may
	if (!/^[0-9a-f-]{36}$/i.test(deskId)) throw new Error(`Not a desk: ${deskId}`);
	return join(desksDir, deskId);
}

export function ensureDesk(desksDir: string, deskId: string): string {
	const path = deskPath(desksDir, deskId);
	mkdirSync(path, { recursive: true });
	return path;
}

export function removeDesk(desksDir: string, deskId: string) {
	rmSync(deskPath(desksDir, deskId), { recursive: true, force: true });
}
