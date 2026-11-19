---
data:
  priority: normal
  status: done
  type: feature
id: gzt2h
title: Review changes from one agent turn
---
Capture the net worktree change across each agent turn and open its historical diff from the conversation.

Completed in FDR-001. Verified two consecutive changes to one file in the workspace UI after a forge restart. Git and detached-host tests cover pre-existing edits, commits, ignored files, steering, reconnects, empty turns and large patches.