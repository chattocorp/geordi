---
data:
  priority: normal
  status: todo
  type: bug
id: qy4am
title: Fix the daemon's file-watching tests that fail locally
---
Six daemon tests fail on `main` in a local run (macOS, inside a Geordi workspace), and did throughout the work on `wy0wt`:

- `file-index.spec.ts`: "catches up a saved worktree across worker restarts and replaces a damaged checkpoint"
- `watch.spec.ts`: "keeps watching the Git state of a worktree in the background once nobody has it open", "ignores in the background what happens to other worktrees' branches", "reports a burst of file changes once, and commits too", "stops watching workspaces nobody looks at, and picks up worktrees created later", "watches a worktree that was removed and came back"

The watcher reports nothing in time (`expected [] to have a length of 1`). They came with the file watcher moving into a thread of its own, once per repository (ADR-014). Find out whether the tests or the watcher are at fault (timing under load, the worker thread in the test runner, the environment), before changing anything. Check whether CI passes them.