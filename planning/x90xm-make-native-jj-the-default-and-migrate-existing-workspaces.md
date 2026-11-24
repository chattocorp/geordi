---
data:
  priority: normal
  status: in_progress
  type: feature
id: x90xm
title: Make native jj the default and migrate existing workspaces
---
Rehearse an offline conversion that keeps the local branch tip, review base, staged bytes, working files and PR identity. Before changing the global creation default, persist backend selection per checkout owner, provision repository control stores, complete daemon command and sandbox support, and verify rollback and archive recovery.

The side-by-side rehearsal preserved different staged and working contents, a local-only commit, deletions, executable files, symlinks and ignored files. The native and Git Changes lists and child test diff matched. The daemon found draft PR #511 by its existing branch after rebuilding the native backend and restoring the candidate. The global default and live cutover remain open. See scripts/prototypes/native-jj.md for implementation gates and rollback.

An isolated desktop trial now gives Auto-mode agents a workspace-bound snapshot, refresh and publish tool. The daemon holds the control store. The packaged app uses a private sample repository and local origin. Quit the trial to resume the regular Git app. Global enablement and live cutover remain open.

Interactive terminals now use the native checkout in the jj trial. Verified the working directory through the terminal UI in both sample-services and the Git sample-cli workspace.