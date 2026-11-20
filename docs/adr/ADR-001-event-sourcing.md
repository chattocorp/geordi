# ADR-001: Event sourcing for all Geordi state

**Date:** 2026-11-14

## Context

Geordi needs to store forge entities (issues, pull requests, reviews), agent sessions, and settings. Git remains the source of truth for repository contents.

- Forge entities are naturally timelines of events; agent sessions are event streams by nature.
- We want zero manual transaction management.
- The UI should update live, and we want a full history and audit trail.
- Authentication is not needed yet, but will be added later.

Alternatives considered:

- **Plain SQLite tables** with implicit per-command transactions: conventional, but no history or event streams for free.
- **means collections inside repositories**: files are branch-scoped, edits dirty working trees, and threads fit poorly. Remains a candidate _feature_ (showing means collections found in repositories).
- **JSONL files**: no indexes, no durable writes.
- **Existing libraries**: Emmett (the only serious contender) has a beta SQLite adapter without projection rebuilds and needs a native driver; Castore, EvtStore, and others are inactive or don't support SQLite.

## Decision

- The append-only event log records all state changes. The one exception is purging archived workspaces at a person's word (ADR-012). An image reference and its immutable blob together preserve an uploaded image.
- The log is one SQLite table, using Node's built-in `node:sqlite`. We build our own small core rather than adopting a library, borrowing Emmett's decide/evolve ideas.
- Appending a batch of events is one statement and therefore atomic. An image upload publishes its immutable bytes first, in the data directory under `blobs/<sha256>`. Its event records the ID, media type and hash. Older events carry their own bytes and are read on demand.
- Projections are in-memory and rebuilt by replaying their event types in sequence order. Projections are disposable. Persisting them with a checkpoint is a later optimisation. The workspace projection releases a transcript when its workspace is archived. An archived transcript can be read again from its workspace stream and any earlier session stream.
- Commands check current projections, then append. Because SQLite access is synchronous and the process is single, check-and-append is race-free as long as nothing is awaited in between.
- Every event records an `actor`, so authentication can be added without migrating data.

## Consequences

- No transactions to think about; full history for free; live updates fall out of "an event was appended".
- We maintain projection code and must evolve event formats carefully, since old events are replayed forever.
- Startup time grows with the log until we persist projections.
- Writers are limited to one process per log, which matches the single-forge model (see ADR-002).
- Back up and restore `blobs/` with the SQLite log. A consistent backup can snapshot the log first, then copy the blobs, which are immutable. An interrupted upload can leave an unreferenced file.
