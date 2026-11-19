import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Only one process may follow these session journals, even while the forge is down. */
export function claimDaemon(directory: string) {
	const db = new DatabaseSync(join(directory, '.daemon.sqlite'));
	try {
		db.exec('PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE');
		db.exec('CREATE TABLE IF NOT EXISTS owner (id TEXT PRIMARY KEY)');
		const row = db.prepare('SELECT id FROM owner').get();
		const id = row ? String(row.id) : randomUUID();
		if (!row) db.prepare('INSERT INTO owner VALUES (?)').run(id);
		db.exec('COMMIT'); // Exclusive locking mode keeps the file locked until close or process exit.
		return { id, close: () => db.close() };
	} catch (cause) {
		db.close();
		throw new Error(`Cannot claim daemon ownership of ${directory}: ${String(cause)}`, { cause });
	}
}
