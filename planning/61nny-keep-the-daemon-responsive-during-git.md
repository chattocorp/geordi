---
data:
  priority: high
  status: done
  type: task
id: 61nny
title: Keep the daemon responsive during Git operations
---
Bound Git runtime, preserve worktree guards, and measure changes requests and event-loop latency.

Outcome: The daemon awaits bounded Git commands and orders worktree changes with session launches. Seven clean Geordi changes reads had median wall times of 121.4 ms before and 68.1 ms after. The worst sampled event-loop delay fell from 130.1 ms to 4.4 ms. Twelve concurrent requests ran the same 16 Git commands as one. Headless verification covered a diff, continuation, a forge and daemon restart, update, and archive. See PR #151.

Review follow-up: real Git tests cover a file written after the clean check and an ignored file that the target tracks. Continue preserves the former and checks out the tracked version of the latter.
