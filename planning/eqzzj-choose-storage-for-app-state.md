---
data:
  priority: high
  status: todo
  tags:
    - storage
  type: decision
id: eqzzj
title: Choose storage for app state
---
Geordi needs storage for runtime state: agent runs, sessions, event logs, indexes.

Proposal: SQLite via Node's built-in `node:sqlite` (optionally Drizzle). Issues/PRs may live as means collections inside the managed repos instead.

Alternatives: plain .jsonl files (hard to query/index), means for everything.