import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

/** SQLite's answer when another connection holds the lock. */
const SQLITE_BUSY = 5;

const globals = globalThis as { __geordiDataLock?: { path: string; lock: DatabaseSync } };

/**
 * Keeps a data directory to this process alone. Two forges writing one event log would each
 * see only their own events, act on a wrong picture and leave a history that never was one
 * (ADR-001: one writer per log). An exclusive SQLite lock on a file of its own does it: the
 * system lets go of it when the process ends, even when it crashes, and the log itself stays
 * readable for whoever wants to look into it. Throws if another process holds it.
 */
export function lockDataDirectory(directory: string) {
	const path = join(directory, 'forge.lock');
	// this process has it already (a module loaded anew in development)
	if (globals.__geordiDataLock?.path === path) return;
	const lock = new DatabaseSync(path);
	try {
		// its journal in memory: no file beside it
		lock.exec('PRAGMA journal_mode = MEMORY');
		lock.exec('PRAGMA locking_mode = EXCLUSIVE');
		lock.exec('BEGIN EXCLUSIVE');
	} catch (cause) {
		lock.close();
		// anything but another process holding it is a problem of its own, and says so
		if ((cause as { errcode?: number }).errcode !== SQLITE_BUSY) throw cause;
		throw new Error(
			`Another Geordi is already running with the data in ${directory}. Quit it first, or give this one data of its own (GEORDI_DATA_DIR).`,
			{ cause }
		);
	}
	// held for as long as the process runs
	globals.__geordiDataLock = { path, lock };
}
