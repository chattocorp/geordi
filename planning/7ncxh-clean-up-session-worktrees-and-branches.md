---
data:
  priority: normal
  status: todo
  tags:
    - agents
  type: feature
id: 7ncxh
title: Clean up session worktrees and branches
---
Sessions create a worktree under `~/.geordi/worktrees/` and a `geordi/<id>` branch, but nothing removes them. Add archiving/deleting sessions that removes the worktree (and optionally the branch).