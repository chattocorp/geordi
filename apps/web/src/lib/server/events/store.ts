import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** An event as produced by application code. */
export type EventInput = { type: string; stream: string; data: unknown };

/** An event as stored in the log. */
export type StoredEvent<E extends EventInput = EventInput> = E & {
	seq: number;
	actor: string | null;
	at: string;
};

/**
 * The folders of copies the store makes before a purge: `<time>-<random>` for a purge that went
 * through, with `pending-` in front while it is still under way (or never went through).
 */
const COPY = /^(pending-)?\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{8}$/;

type Row = {
	seq: number;
	type: string;
	stream: string;
	data: string;
	actor: string | null;
	at: string;
};

/**
 * Append-only event log on SQLite. The one exception is `purge`, which deletes whole streams
 * at a person's word (ADR-012).
 *
 * All writes go through `append`, which issues a single INSERT statement, so a batch of
 * events is atomic without explicit transactions. SQLite access is synchronous, so code
 * that checks state and then appends (without awaiting in between) is race-free.
 *
 * After each append, projections are updated first, then listeners are notified,
 * so listeners always observe up-to-date projections.
 *
 * A projection or listener that throws on an event is logged and passed over: by then the
 * event is in the log, and failing on it would fail again on every replay, so the forge
 * could no longer start.
 */
export class EventStore<E extends EventInput = EventInput> {
	readonly #db: DatabaseSync;
	readonly #projections = new Map<string, (event: StoredEvent<E>) => void>();
	readonly #listeners = new Set<(events: StoredEvent<E>[]) => void>();

	readonly path: string;
	/**
	 * Where each purge leaves a copy of the log as it was before, in a folder named after when
	 * it was made (with whatever else the purge took, such as images: `blobs/`), so that it
	 * can be undone by hand. Only the newest is kept. `null` in memory.
	 */
	readonly purgeCopies: string | null;

	constructor(path: string) {
		this.path = path;
		this.purgeCopies = path === ':memory:' ? null : join(dirname(path), 'purge-copies');
		this.#db = new DatabaseSync(path);
		this.#db.exec(`
			PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS events (
				seq    INTEGER PRIMARY KEY AUTOINCREMENT,
				type   TEXT NOT NULL,
				stream TEXT NOT NULL,
				data   TEXT NOT NULL,
				actor  TEXT,
				at     TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS events_stream ON events (stream, seq);
		`);
	}

	append(events: E | E[], { actor = null }: { actor?: string | null } = {}): StoredEvent<E>[] {
		const batch = Array.isArray(events) ? events : [events];
		if (batch.length === 0) return [];
		return this.#publish(this.#insert(batch, actor));
	}

	/**
	 * Deletes these streams from the log for good, and appends `record` in the same
	 * transaction: what was deleted, by whom, and whatever the projections still need to know
	 * of it (ADR-012). Projections see only the record, so it must tell them what to let go of.
	 *
	 * First it copies the log as it is into a new folder in `purgeCopies` (returned as `copy`):
	 * without a copy nothing is deleted. Its name starts with `pending-` until the deletion has
	 * gone through; then older copies go. A purge that fails takes its own copy away. Then the file is made smaller. Nothing after
	 * the deletion can fail the purge: what is left undone there is logged. Returns how many
	 * bytes smaller the log got (the copy, kept until the next purge, takes about the old size).
	 */
	purge(
		streams: string[],
		record: E,
		{ actor = null }: { actor?: string | null } = {}
	): { event: StoredEvent<E>; freed: number; copy: string | null } {
		const size = () =>
			(this.#db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count *
			(this.#db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
		const before = size();
		// a name of its own, even for two purges within the same millisecond
		const name = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
		const pending = this.purgeCopies && join(this.purgeCopies, `pending-${name}`);
		if (this.purgeCopies && pending) {
			mkdirSync(this.purgeCopies, { recursive: true, mode: 0o700 });
			mkdirSync(pending, { mode: 0o700 }); // fails if it is there: never someone else's
		}
		let rows: Row[];
		try {
			if (pending) {
				this.#db.prepare('VACUUM INTO ?').run(join(pending, 'events.db'));
				// as private as the log: SQLite makes it with the process's umask
				chmodSync(join(pending, 'events.db'), 0o600);
			}
			this.#db.exec('BEGIN');
			try {
				this.#db
					.prepare('DELETE FROM events WHERE stream IN (SELECT value FROM json_each(?))')
					.run(JSON.stringify(streams));
				rows = this.#insert([record], actor);
				this.#db.exec('COMMIT');
			} catch (problem) {
				this.#db.exec('ROLLBACK');
				throw problem;
			}
		} catch (problem) {
			if (pending) rmSync(pending, { recursive: true, force: true });
			throw problem;
		}
		// It is deleted: from here on, nothing may fail the purge or keep the projections from
		// hearing of it.
		const [event] = this.#publish(rows);
		const later = (what: string, work: () => void) => {
			try {
				work();
			} catch (problem) {
				console.error(`[events] after a purge, could not ${what}`, problem);
			}
		};
		let copy = pending;
		if (this.purgeCopies && pending) {
			const copies = this.purgeCopies;
			// without `pending-`, it is the copy of a purge that went through
			later('mark the copy of the log', () => {
				renameSync(pending, join(copies, name));
				copy = join(copies, name);
			});
			// The copies of purges before, and of any that never went through: only folders it
			// made, and only once this copy is marked as the one to go back to.
			if (copy === join(copies, name))
				later('remove the older copies of the log', () => {
					for (const older of readdirSync(copies))
						if (COPY.test(older) && join(copies, older) !== copy)
							rmSync(join(copies, older), { recursive: true });
				});
		}
		// What was deleted is only gone from the disk once the file is written anew. If that
		// fails (a full disk), it is still deleted, and the space is reused for what comes next.
		later('compact the log', () => {
			this.#db.exec('VACUUM');
			this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		});
		let freed = 0;
		later('measure the log', () => (freed = Math.max(0, before - size())));
		return { event, freed, copy };
	}

	#insert(batch: E[], actor: string | null): Row[] {
		const at = new Date().toISOString();
		const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
		const params = batch.flatMap((e) => [e.type, e.stream, JSON.stringify(e.data), actor, at]);
		const rows = this.#db
			.prepare(
				`INSERT INTO events (type, stream, data, actor, at) VALUES ${placeholders} RETURNING *`
			)
			.all(...params) as Row[];
		// RETURNING promises no order
		return rows.sort((a, b) => a.seq - b.seq);
	}

	#publish(rows: Row[]): StoredEvent<E>[] {
		const stored = rows.map((row) => this.#parse(row));
		for (const event of stored) for (const apply of this.#projections.values()) apply(event);
		for (const listener of this.#listeners)
			try {
				listener(stored);
			} catch (problem) {
				console.error(`[events] a listener failed on events ${stored[0].seq}…`, problem);
			}
		return stored;
	}

	/** All events of one type, in order. */
	readType(type: string): StoredEvent<E>[] {
		const rows = this.#db
			.prepare('SELECT * FROM events WHERE type = ? ORDER BY seq')
			.all(type) as Row[];
		return rows.map((row) => this.#parse(row));
	}

	/** All events after the given sequence number, in order. */
	readAll(after = 0): StoredEvent<E>[] {
		const rows = this.#db
			.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq')
			.all(after) as Row[];
		return rows.map((row) => this.#parse(row));
	}

	/** All events of one stream, in order. */
	readStream(stream: string): StoredEvent<E>[] {
		const rows = this.#db
			.prepare('SELECT * FROM events WHERE stream = ? ORDER BY seq')
			.all(stream) as Row[];
		return rows.map((row) => this.#parse(row));
	}

	/**
	 * Registers an in-memory projection, replays the matching event types into it, and keeps it
	 * updated on every append. Registering under an existing name replaces it (HMR-safe).
	 */
	project<S>(
		name: string,
		initial: () => S,
		evolve: (state: S, event: StoredEvent<E>) => S,
		domains: string[] = []
	) {
		let state = initial();
		const evolveSafely = (event: StoredEvent<E>) => {
			try {
				state = evolve(state, event);
			} catch (problem) {
				console.error(
					`[events] projection ${name} failed on event ${event.seq} (${event.type})`,
					problem
				);
			}
		};
		const domainsOfInterest = new Set(domains);
		const where = domains.length ? 'WHERE ' + domains.map(() => 'type GLOB ?').join(' OR ') : '';
		const rows = this.#db
			.prepare(`SELECT * FROM events ${where} ORDER BY seq`)
			.iterate(...domains.map((domain) => domain + '.*'));
		for (const row of rows) evolveSafely(this.#parse(row as Row));
		this.#projections.set(name, (event) => {
			if (!domains.length || domainsOfInterest.has(event.type.split('.', 1)[0]))
				evolveSafely(event);
		});
		return { get: () => state };
	}

	subscribe(listener: (events: StoredEvent<E>[]) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Yields `read()` now and again after an append that affects this view.
	 *
	 * `also` adds another reason to read again, for state that isn't in the log: it is given
	 * a function to call whenever that state changes, and returns one that stops it calling.
	 *
	 * `signal` ends it: a generator waiting for the next change can't be interrupted from
	 * outside, so without it everything held here (and by `also`) would stay held after the
	 * reader has gone, until something happens to be appended.
	 */
	async *live<T>(
		read: () => T,
		also?: (changed: () => void) => () => void,
		signal?: AbortSignal,
		affects?: (event: StoredEvent<E>) => boolean
	): AsyncGenerator<T> {
		let notify = () => {};
		const abort = () => notify();
		signal?.addEventListener('abort', abort, { once: true });
		const unsubscribe = this.subscribe((events) => {
			if (!affects || events.some(affects)) notify();
		});
		let unsubscribeAlso: (() => void) | undefined;

		try {
			// inside the `try`, so that a failure here still lets go of the store
			unsubscribeAlso = also?.(() => notify());
			while (!signal?.aborted) {
				// Created before reading, so appends during or after the read are never missed.
				const changed = new Promise<void>((resolve) => (notify = resolve));
				yield read();
				if (!signal?.aborted) await changed;
			}
		} finally {
			unsubscribe();
			unsubscribeAlso?.();
			signal?.removeEventListener('abort', abort);
		}
	}

	close() {
		this.#db.close();
	}

	#parse(row: Row): StoredEvent<E> {
		return { ...row, data: JSON.parse(row.data) } as StoredEvent<E>;
	}
}
