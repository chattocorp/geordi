---
data:
  priority: normal
  status: in_progress
  type: feature
id: dg09y
title: 'Redesign Run tasks: named ports, one URL per task, a calmer Tasks tab'
---
A process does not map to one port or one URL. Redesign `.geordi.yml` tasks (FDR-006).

## Outcome

- Tasks have a `command`, a `url`, or both, plus `ports`, `needs`, `default`, `label`. `run`, `jobs`, `urls` (top level and in tasks), `default`, `ports` and `.geordi.toml` are no longer read; the Tasks tab says what to write instead.
- `ports: [web, live]` names what a command listens on. Port names are the workspace's, each one task's (listed twice is refused). Everything gets `GEORDI_PORT_<NAME>`; the task's command its first as `$PORT`. Ten spare ports per workspace (`GEORDI_PORT`, `GEORDI_PORTS`). Stored per name; existing numbers carry over.
- `{web}` in a URL is the port named `web`; the task listening there is needed. Up = all ports answer, or started when none.
- Tasks tab: default tasks first; one row per task (mark, name, URL at the end); a row runs the task (again); terminal and stop on pointing or focus; middle click goes to (or starts and shows) its terminal; pointing highlights what a task needs; quiet dots when stopped, gold play when serving, gold turning arrows when working without ports.
- The dev web task loads the forge itself, so that all its ports listen.
- Stop cancels a pending task launch while its command or ports are starting. Tasks that depend on it also stop, and a canceled launch cannot open a URL.
- Each dependency leaves the starting state as soon as its own readiness check finishes, while other tasks continue to start.
