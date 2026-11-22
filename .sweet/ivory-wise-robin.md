---
breaking: true
type: feature
---

Tasks in `.geordi.yml` now name their ports: give a task `ports: [http, live]` for as many as its command listens on, or none. A task can have several links (`urls`), and a link that needs nothing just opens. The Tasks tab is calmer: stopped tasks are quiet dots, so what runs stands out, and a task's only link sits at the end of its row. Every workspace also has ten spare ports for anything you or your agents start. Your ports carry over. The old `run`, `jobs`, `urls`, `default` and `ports` settings and `.geordi.toml` are no longer read. Move them into `tasks`, and the Tasks tab tells you what to change.
