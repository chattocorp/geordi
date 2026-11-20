---
data:
  priority: normal
  status: todo
  type: bug
id: 0952p
title: Investigate Forge not set up after merging main
---
An existing worktree shows Forge not set up after merging main and restarting Geordi. New worktrees reportedly work. The source of the Forgejo environment variables is unknown.

The daemon checks the registered repository's origin using its process environment. In an isolated test with an existing worktree, a fresh process recognized the same origin once it received the Forgejo variables. The ribbon shows the warning only for committed work waiting to be pushed, so a clean new branch can hide the same configuration problem.

Compare old and new worktrees with committed changes to publish on the same repository and daemon. Verify provider recognition and the displayed standing across a restart.