---
data:
  priority: normal
  status: in_progress
  type: feature
id: dg09y
title: 'Redesign Run tasks: named ports, several links, a calmer Tasks tab'
---
A process does not map to one port or one URL. Redesign `.geordi.yml` tasks (FDR-006):

- `ports: [http, live]` per task: none unless named; `$PORT_<NAME>`, `GEORDI_PORT_<TASK>_<PORT>`.
- `url` or `urls` (several, by name); `{http}` / `{web.http}` in URLs.
- Up = all ports listening; none = up at once.
- Ten spare ports per workspace (`GEORDI_PORT`, `GEORDI_PORTS`); `ports: N` goes.
- Drop `run`, `jobs`, `urls`, `default`, `ports`, `.geordi.toml`.
- Ports keyed `task.port`; a task's first port takes its old one.
- Tasks tab: one row per task, links under it, passive status mark, stop / run again beside.

Acceptance: this repository's `.geordi.yml` uses it; checks, lint and tests pass; FDR-006 and docs updated.