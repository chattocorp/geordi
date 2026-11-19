---
data:
  priority: normal
  status: in_progress
  type: feature
id: 01jz2
title: Publish Geordi as an npm package (npx geordi)
---
Run forge and daemon with `npx geordi`, without the desktop app.

- `apps/cli`, published as `geordi`: the forge build, the daemon and the ACP wrappers bundled (so npm does not pull the agents' own ~700 MB of binaries); `@lydell/node-pty` is the only dependency.
- Shares staging and the services' environment with the desktop app (ADR-008: no second way of running anything).
- Same ports and data as the desktop app, so only one Geordi runs at a time.
- Loopback only until there is authentication.
- Released with the app (same version), published from CI.