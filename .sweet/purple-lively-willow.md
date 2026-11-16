---
type: feature
---

A repository can name `setup` and `teardown` scripts in `.geordi.toml`. Setup runs in a new workspace before its agent starts (to install dependencies, say), and teardown runs when you archive a workspace, before its worktree is removed. Both run only once you have approved them, and setup can be run again from the Run menu.

`setup` and `teardown` can no longer be used as job names.
