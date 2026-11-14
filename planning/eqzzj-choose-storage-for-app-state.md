---
data:
  priority: high
  status: done
  tags:
    - storage
  type: decision
id: eqzzj
title: Use event sourcing for all Geordi state
---
## Decision

Geordi uses **event sourcing**. An append-only event log is the single source of truth; all current state is derived from it.

## Context

- Forge entities (issues, PRs, reviews) are naturally timelines of events.
- Agent runs are event streams by nature.
- We want zero manual transaction management. Appending one event is atomic; nothing else is ever written as source of truth.
- Live UI updates fall out naturally: new event -> notify `query.live` subscribers.
- Full history/audit for free. Every event carries an `actor`, so auth can be added later without migrating data.

## Design (initial)

- **Log:** one SQLite table (`node:sqlite`), `seq` as global monotonic order. Envelope: `seq`, `type`, `stream` (e.g. `issue:<id>`), `data` (JSON), `actor`, `at`.
- **Projections:** in-memory, rebuilt by replaying the log on boot. Persist projections (with checkpoint `seq`) later if replay gets slow; they are always disposable.
- **Commands:** validate against current projections, then append. Single process + synchronous SQLite means check-and-append is race-free as long as handlers do not `await` in between.
- **Git** stays the source of truth for repository contents; Geordi only caches/indexes it.

## Alternatives considered

- Plain SQLite tables with implicit per-command transactions: conventional, but no history/streams for free.
- means collections inside repos: branch-scoped files, dirty working trees, poor fit for threads. Remains a candidate *feature* (show means collections found in repos).
- JSONL files: no indexes or durable writes.