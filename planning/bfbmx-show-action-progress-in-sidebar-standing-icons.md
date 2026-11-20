---
data:
  priority: normal
  status: done
  type: bug
id: bfbmx
title: Show action progress in sidebar standing icons
---
The sidebar shows a green merge, red repair, or purple archive animation for the active operation. Agent turns and worktree operations share the activity slot. Background jobs no longer replace the workspace standing. A queued agent action takes over when its turn begins and survives forge replay. Browser tests cover the symbols, and reduced motion keeps them static. Type checks, lint, tests, and release validation passed.