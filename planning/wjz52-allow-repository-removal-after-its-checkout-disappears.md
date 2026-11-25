---
data:
  priority: high
  status: done
  tags:
    - repos
    - workspaces
  type: bug
id: wjz52
title: Allow repository removal after its checkout disappears
---
## Behavior

Settings → Repositories warns when a registered checkout is missing. Remove asks once, stops the repository’s agents and jobs, deletes its Geordi worktrees (including uncommitted files), and archives its conversations. The original checkout and remaining Git branches stay on disk. A locked workspace must be unlocked first.

## Outcome

Implemented for healthy and missing checkouts. Shared worktrees are cleaned up once. The registration remains available for retry if cleanup fails.

Verified cancellation, deletion of dirty worktrees, retention of a healthy checkout, isolation from another repository, and access to archived conversations after a forge restart. Tests also cover a locked workspace, a shared worktree, concurrent workspace creation, a disconnected daemon, and retry.