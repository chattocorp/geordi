---
data:
  priority: normal
  status: done
  type: feature
id: 3q48e
title: Choose a worktree's base branch, and change it later
---
Follows #465 (one base per worktree). FDR-001 decision 4.

Done:
- The new-workspace composer has a branch picker beside the repository: the upstream's branches where there is one (else local ones), the most recently committed to first; defaults to where work starts (`origin/HEAD`).
- Until a pull request exists, the Changes pane's comparison branch is the same picker; changing it records `workspace.based` (moves nothing).
- Agents say they moved their branch with the `set_base` MCP tool.
- A named base is the upstream's copy (`origin/…`), unless the upstream lacks it (an agent's unpushed branch).
- Daemon `branches` request; new worktrees always fetch first; setup does not run by itself on another base.
