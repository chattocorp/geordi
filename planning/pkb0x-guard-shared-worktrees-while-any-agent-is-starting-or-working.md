---
data:
  priority: normal
  status: done
  type: bug
id: pkb0x
title: Guard shared worktrees while any agent is starting or working
---
Continuing or updating a workspace must leave its worktree alone while an agent sharing it is working or waiting for setup. Idle sessions and agents in other directories must allow both operations.

Outcome: Both daemon requests check active sessions and starting turns by directory, including after fetching. Unit tests and an isolated daemon confirmed the guard for shared agents, including a turn waiting for setup. Both operations succeeded once the aide was idle.