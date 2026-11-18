---
data:
  priority: high
  status: done
  type: bug
id: 83qvb
title: Refresh the PR ribbon immediately after agent turns
---
Follow-up to 9gsgh. Turn-end checks supersede older worktree reads. When GitHub still lists no PR for a pushed branch, an authenticated refresh searches by head branch. PR checks reuse pending release and configuration reads and retain known status if the provider fails. Tests cover out-of-order listings, stale validators, queued file changes, branch changes on failure, and follow-up timing and routing.