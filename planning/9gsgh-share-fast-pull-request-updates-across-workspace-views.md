---
data:
  priority: high
  status: done
  type: task
id: 9gsgh
title: Share fast pull request updates across workspace views
---
Extended bf44h. Background answers update the open PR and merge ribbon. The daemon follows the remote-tracking commit and polls active CI on a ten-second target. Anonymous access keeps its five-minute cache. Verified both live views through simulated CI transitions and an isolated forge restart.