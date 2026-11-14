---
data:
  priority: high
  status: done
  tags:
    - storage
  type: feature
id: 6m7f4
title: Event store core
---
Implement the event sourcing core decided in ADR-001 (`docs/adr/ADR-001-event-sourcing.md`). Own implementation on `node:sqlite`, no dependencies; borrow Emmett's decide/evolve pattern.

## Acceptance criteria

- Append-only event log in SQLite; multi-event appends are atomic without explicit transactions
- Typed events with `actor` and timestamp
- In-memory projections, rebuilt by replay on boot, updated synchronously on append
- Live helper that turns projection state into a `query.live` stream
- A minimal issues slice proving the pipeline end to end
- Tests

## Outcome

- Core in `src/lib/server/events/store.ts`: `append` (single multi-row INSERT, atomic), `readAll`, `readStream`, `project` (replay + sync updates, HMR-safe by name), `subscribe`, `live`.
- Issues slice: `src/lib/server/issues.ts`, `/issues` page with form + commands + `query.live`.
- 10 unit tests. Verified end to end against the production build: form POST and command each append one event, an open live stream received both updates, state rebuilt correctly after restart.
- Note: production requires `ORIGIN`, otherwise SvelteKit rejects remote form/command requests.
