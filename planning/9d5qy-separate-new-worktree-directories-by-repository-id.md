---
data:
  priority: normal
  status: done
  type: bug
id: 9d5qy
title: Separate new worktree directories by repository ID
---
Give each repository its own directory for new workspace worktrees. Keep existing worktrees accessible in place, including after replay and for agents sharing a worktree.

Outcome: New worktree owners record the repository ID as their parent directory. Prior workspaces keep the checkout basename. Verified same-name repositories with matching short worktree IDs, event replay for shared agents, and uncommitted files in both layouts after a development forge restart.