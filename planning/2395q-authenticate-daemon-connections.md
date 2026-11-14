---
data:
  priority: normal
  status: todo
  tags:
    - agents
    - auth
  type: feature
id: 2395q
title: Per-daemon credentials for remote daemons
---
Daemons currently authenticate with a single shared token that the forge creates in its data directory (`daemon-token`, mode 0600) and same-machine daemons read from disk. Browser-originated upgrades are refused, and session output is only accepted from the daemon a session was assigned to.

Still needed before daemons run on other machines (ADR-002): per-daemon credentials issued and revocable by the forge, TLS for non-local connections, and a way to enrol a remote daemon.