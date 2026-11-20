import { DatabaseSync } from 'node:sqlite';

/** An event as produced by application code. */
export type EventInput = { type: string; stream: string; data: unknown };

/** An event as stored in the log. */
export type StoredEvent<E extends EventInput = EventInput> = E & {
	seq: number;
	actor: string | null;
	at: string;
};

type Row = {
	seq: number;
	type: string;
	stream: string;
	data: string;
	actor: string | null;
	at: string;
};

/**
 * Append-only event log on SQLite.
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

	constructor(path: string) {
		this.path = path;
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

		const at = new Date().toISOString();
		const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
		const params = batch.flatMap((e) => [e.type, e.stream, JSON.stringify(e.data), actor, at]);
		const rows = this.#db
			.prepare(
				`INSERT INTO events (type, stream, data, actor, at) VALUES ${placeholders} RETURNING *`
			)
			.all(...params) as Row[];

		// RETURNING promises no order
		const stored = rows.sort((a, b) => a.seq - b.seq).map((row) => this.#parse(row));
		for (const event of stored) for (const apply of this.#projections.values()) apply(event);
		for (const listener of this.#listeners)
			try {
				listener(stored);
			} catch (problem) {
				console.error(`[events] a listener failed on events ${stored[0].seq}…`, problem);
			}
		return stored;
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
