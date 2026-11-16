---
data:
  priority: normal
  status: todo
  type: feature
id: edgp5
title: Workspace setup and teardown scripts
---
Extends repository configuration (FDR-006), which lists setup and teardown scripts as out of scope.

## Ideas

- `.geordi.toml` names a setup script, run once in a new worktree before the agent's first turn (install dependencies, copy `.env`, migrate a database).
- A teardown script, run when a workspace is archived, before its worktree is removed (stop services, drop databases).
- Both run in the daemon as terminals, with the workspace's `GEORDI_PORT…` environment, and only as approved (`approvals.ts`).

## Open questions

- Does the first turn wait for setup to finish? What if setup fails?
- Is setup a job with a flag, or a setting of its own?
- Read from the workspace's file or from the base branch's (an agent can change the former)?

## Acceptance criteria

- A new workspace runs the setup script, visibly, before the agent starts.
- Archiving runs the teardown script before the worktree is removed.
- Both are recorded in FDR-006 (or a new FDR) and in `CONFIG_SETTINGS`.