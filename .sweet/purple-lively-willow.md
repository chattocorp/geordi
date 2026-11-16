---
type: feature
---

A repository can name `setup` and `teardown` scripts in its configuration. Setup runs in a new workspace before its agent starts (to install dependencies, say), and teardown runs when you archive a workspace, before its worktree is removed. Both run only once you have approved them. A workspace says when its repository's setup script is waiting for that, with a button to review it.

`setup` and `teardown` can no longer be used as job names.
