---
data:
  priority: normal
  status: done
  type: feature
id: g5eef
title: Collaborate across repository workspaces
---
Repository agents can message peers in accessible repositories and place reviewers in descendant worktrees. Archiving follows same-repository children and shared worktrees. Verified with MCP and archive regression tests and HTTP calls across a forge restart using synthetic sessions. A reviewer placed in a descendant’s worktree follows that worktree during archive, including an A → B → A delegation chain. Nested agents sharing their parent’s checkout still archive with the parent.