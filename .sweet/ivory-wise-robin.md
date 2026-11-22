---
breaking: true
type: feature
---

Tasks in `.geordi.yml` now name their ports: give a task `ports: [http, live]` for as many as its command listens on, or none. In a `url`, `{http}` is the port named `http` (everything in the workspace finds it as `GEORDI_PORT_HTTP`), and a task with only a `url` that needs nothing just opens it. The Tasks tab is calmer: stopped tasks are quiet dots, so what runs stands out, a task's URL sits at the end of its row, and what you can do with a task shows where you point at it. Every workspace also has ten spare ports for anything you or your agents start. Your ports carry over. The old `run`, `jobs`, `urls`, `default` and `ports` settings and `.geordi.toml` are no longer read. Move them into `tasks`, and the Tasks tab tells you what to change.
