---
data:
  priority: high
  status: done
  type: task
id: 9gsgh
title: Share fast pull request updates across workspace views
---
Extended bf44h. Background answers update the open PR and merge ribbon. The daemon follows the remote-tracking commit and polls active CI on a ten-second target. Anonymous access keeps its five-minute cache. A cold read establishes the branch baseline. The forge budgets discovery searches separately from known PR reads and schedules the watched-workspace fallback one minute after a fresh answer. Verified both live views through simulated CI transitions and an isolated forge restart. Regression tests cover first pushes, cold starts, overlapping reads, and fallback timing.

Opening a workspace now reuses recent upstream status from the sidebar or a previous visit. Local Git still checks the current branch. A branch switch, expired status, or explicit refresh triggers a lookup.
