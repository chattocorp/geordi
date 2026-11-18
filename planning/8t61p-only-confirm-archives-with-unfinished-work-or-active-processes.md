---
data:
  priority: normal
  status: done
  type: bug
id: 8t61p
title: Only confirm archives with unfinished work or active processes
---
Replaces the unconditional confirmation from yj2tv. Archive checks affected workspaces for active agents, terminal processes, and unfinished Git work. Clean workspaces archive directly. Regression tests cover the direct path, confirmation, cancellation, and blocked agents.