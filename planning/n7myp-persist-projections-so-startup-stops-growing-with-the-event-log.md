---
data:
  priority: low
  status: todo
  tags:
    - storage
  type: task
id: n7myp
title: Persist projections so startup stops growing with the event log
---
ADR-001 names persisting projections with a checkpoint as a later optimisation. This records when it becomes due, and what was tried instead.

## Measurements (installed app, 2026-11-20)

- Log: 6 days old, 57k events, 76 MB of event data (100 MB file). Growing ~25 MB a day since agents started working in earnest.
- Forge replay (repositories and workspaces): ~240 ms. Roughly 3 ms per MB, so ~75 ms more each day: ~2 s after a month at this pace.
- `workspace.output` is 58 MB of it; 50 MB (87%) belongs to archived workspaces (412 of 441). Replay builds their transcripts and drops them at `workspace.archived`.

## Tried and dropped

Passing over archived workspaces' transcript-only output during replay (see 5vzw6 for earlier replay work):

- Skipping by inspecting each row in JavaScript saved only a third (~160 ms): handing the data to JavaScript costs more than parsing it.
- A derived `event_kinds` table, so SQLite could skip rows without reading them, got ~120 ms with identical results on the real log. Dropped as not worth it: a second table, a backfill on every start and a skip rule with an exception for 120 ms; a domain-side list of "transcript-only" kinds that breaks quietly if one of them gains a side effect; and replay would still grow with the log.

## When and what

Pick this up once forge startup passes about a second. Persist the projections with the `seq` they reflect and replay only what comes after. Rebuild from the log when the projection code changes (a version per projection), so they stay disposable.