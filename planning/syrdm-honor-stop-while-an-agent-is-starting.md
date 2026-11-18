---
data:
  priority: normal
  status: done
  type: bug
id: syrdm
title: Honor Stop while an agent is starting
---
Stop during preparation must fail the turn once, discard steering, and allow the next turn to start.

Stop now interrupts the wait for a previous session, upstream fetch, setup, or configuration. The daemon gives pending socket input a chance to run after synchronous worktree preparation. Tests cover all five cases, duplicate Stop, dropped steering, and starting the next turn.