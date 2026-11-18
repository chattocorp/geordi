---
data:
  priority: high
  status: done
  type: bug
id: 83qvb
title: Refresh the PR ribbon immediately after agent turns
---
Follow-up to 9gsgh. A turn-end lookup supersedes older worktree reads and revalidates the repository PR listing. Regression tests cover a pending refresh and a PR opened just after a push.