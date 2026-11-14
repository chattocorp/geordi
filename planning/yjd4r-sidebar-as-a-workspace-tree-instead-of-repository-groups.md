---
data:
  priority: normal
  status: done
  tags:
    - ui
  type: feature
id: yjd4r
title: Sidebar as a workspace tree instead of repository groups
---
FDR-002. Show root workspaces at the top level with their children nested, the repository as a badge, and running state rolled up to parents. Repositories get their own list.

Outcome: implemented. Verified end to end with Claude (child in the same workspace) and Codex (Claude child in its own worktree, merged back by the parent).