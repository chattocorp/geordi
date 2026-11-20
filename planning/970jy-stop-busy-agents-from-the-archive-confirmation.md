---
data:
  priority: normal
  status: done
  type: feature
id: 970jy
title: Stop busy agents from the archive confirmation
---
The archive confirmation can stop busy agents in the affected workspaces. Cleanup waits for all of them to become idle. Tests cover confirmation, cancellation, queued work, an unacknowledged stop, retry, and agent-requested archives.