---
type: fix
---

Settings warns when a repository checkout is missing. Remove the repository in one step to delete its Geordi worktrees and keep its conversations in Archive. If removal fails, queued work and agent reports resume. If the daemon disconnects during teardown, it keeps the worktree for your retry.
