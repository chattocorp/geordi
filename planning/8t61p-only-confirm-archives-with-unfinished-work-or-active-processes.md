---
data:
  priority: normal
  status: done
  type: bug
id: 8t61p
title: Only confirm archives with unfinished work or active processes
---
Replaces the unconditional confirmation from yj2tv. Archive checks affected workspaces for active agents, terminal processes, and unfinished Git work. Clean workspaces archive directly. Regression tests cover the direct path, confirmation, cancellation, and blocked agents.

Idle interactive shells now archive quietly. Tested foreground and background processes, a program that replaces its shell, and configured jobs. Restarted the forge’s daemon connection during a command and verified that the check detected the command until the shell returned to its prompt.

The archive preview now shows each applicable consequence once across all affected workspaces. It includes staged edits even when a working file matches HEAD.
