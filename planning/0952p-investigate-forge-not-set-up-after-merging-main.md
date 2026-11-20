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

Reproduction attempt: created a worktree before adding a forge.env file on main, merged main into it, then created a second worktree. Both had committed changes to publish. In a fresh process, both upstream lookups reported the unknown host with the file alone. Both recognized Forgejo when the process received those variables. The original discrepancy remains unexplained. The next useful evidence is whether the new workspace actually shows a pull request on the same host.