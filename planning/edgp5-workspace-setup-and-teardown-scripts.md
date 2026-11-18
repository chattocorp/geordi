---
data:
  priority: normal
  status: done
  type: feature
id: edgp5
title: Workspace setup and teardown scripts
---
Extends repository configuration (FDR-006), which listed setup and teardown scripts as out of scope.

## Ideas

- `.geordi.toml` names a setup script, run once in a new worktree before the agent's first turn (install dependencies, copy `.env`, migrate a database).
- A teardown script, run when a workspace is archived, before its worktree is removed (stop services, drop databases).
- Both run in the daemon as terminals, with the workspace's `GEORDI_PORT…` environment, and only as approved (`approvals.ts`).

## Open questions (decided, see FDR-006 decisions 7–11)

- Does the first turn wait for setup to finish? **Yes.** It then goes ahead however setup ended; a failure (with the end of its output), a stop, or a setup that didn't run is told to the agent with its first message.
- Is setup a job with a flag, or a setting of its own? **Its own top-level settings**, `setup = "…"` and `teardown = "…"`. They run in job-like terminals (`run-setup`, `run-teardown`); `setup`/`teardown` are no longer valid job names.
- Read from the workspace's file or from the base branch's? **The workspace's file, as for jobs** (FDR-006 decision 2). The safeguards are approval (only commands a person agreed to for the repository) and decision 10: nothing runs unasked in an agent's work. Setup runs by itself only in a worktree made fresh from the main line (not one started from an agent's branch, nor one restored from the workspace's branch). Teardown runs only when a person archives.

## Acceptance criteria

- A new workspace runs the setup script, visibly, before the agent starts.
- Archiving runs the teardown script before the worktree is removed.
- Both are recorded in FDR-006 (or a new FDR) and in `CONFIG_SETTINGS`.

## Outcome

- Daemon (`main.ts`: `setUp`, `tearDown`, `runScript`; `scripts.ts`: the note for the agent): setup runs when the daemon makes a worktree, in a terminal it reports with the new `terminal.opened` message. The turn waits (reported to the forge as running), and `turn.stop` ends the waiting turn but leaves setup running. Teardown runs in `removeWorktree` (when `teardown` is set, i.e. a person archives), after the uncommitted-work check (`removable` in `remove.ts`), with a 2-minute limit (`TEARDOWN_TIMEOUT_MS`). The forge waits `REMOVE_TIMEOUT_MS` for removal. Archiving goes on however teardown ends.
- `terminals.ts` notices a command's end with an OSC marker (`onEnded`), so the output stays readable while the daemon goes on.
- UI: **Set up** in the dock's Run menu runs setup by hand. The approval dialog includes the teardown along with the first other command agreed to. `check_configuration` reports setup and teardown.
- Tests: parser, the agent note, pty end detection, forge terminals, and teardown only on a person's archiving. End to end, with a stand-in forge restarted mid-setup: the new forge's `hello` listed the waiting turn and the `run-setup` terminal, the agent ran after setup, and archiving ran the teardown with the same `GEORDI_PORT` before the worktree went.
- Limitations: a daemon restart mid-setup ends the setup and loses the waiting turn, and setup isn't rerun automatically. Approval is per command, not per slot: an approved job command could be named as setup.
- Successful setup now closes its terminal automatically, including after a manual retry. A failed setup keeps its output visible.
