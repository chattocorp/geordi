---
data:
  priority: normal
  status: done
  type: feature
id: 19rpq
title: Control pull request auto-merge from the workspace
---
Workspace and sidebar actions enable and cancel native GitHub auto-merge through forges. The daemon checks the pull request branch and sends the workspace commit when enabling. Verified the provider requests and stale commit handling with simulated GitHub responses, and both ribbon actions in Chromium. The ribbon shows “Checks running” while checks are pending and offers “Disable Auto-merge” when permitted. Chromium stories cover the button during and after checks.

When GitHub allows a merge while checks are pending, the ribbon shows “Optional checks running” beside “Merge PR”. A Chromium story covers this state.
