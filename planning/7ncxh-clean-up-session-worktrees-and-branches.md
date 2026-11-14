---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: feature
id: 7ncxh
title: Clean up workspace worktrees and branches
---
Workspaces create a worktree under `~/.geordi/worktrees/` and a `geordi/<id>` branch, but nothing removes them. Add archiving/deleting workspaces that removes the worktree (and optionally the branch).

Outcome: workspaces can be archived, which removes the worktree and keeps the branch (FDR-001). Deleting the branch is still manual.