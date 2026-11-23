---
data:
  priority: normal
  status: done
  tags:
    - storage
  type: feature
id: 5mj73
title: Delete archived workspaces for good
---
Let the person trim the event log by deleting archived workspaces for good (ADR-012, FDR-014).

## Acceptance criteria

- From the archive, one workspace (context menu) or all listed ones (**Delete all** / **Delete N**) can be deleted after a confirmation.
- A workspace goes with every agent it started and every agent in its worktree. Nothing is deleted unless all of them are archived.
- What stays is unchanged after a restart: messages from deleted agents stay theirs, and a worktree a deleted agent reported stays known.
- Images sent to them go too; their files go once no other image uses them.
- The log file gets smaller.

## Outcome

Done. `EventStore.purge` deletes whole streams and appends a `workspace.purged` record in one transaction, then runs `VACUUM`. The record carries when each deleted workspace was created (read before replay, for sender attribution) and the worktrees of owners that stay.

Tested against a copy of the installed app's log: purging all 428 archived workspaces took 0.4 s, shrank the file from 106 MB to 13 MB and replay from 253 ms to 32 ms, and left 91 of 100 image blobs deleted. All 22 workspaces in use were identical after a fresh replay. Also walked through in the dev app (context menu, both dialogs, the outcome) with no console errors.

This makes n7myp (persisting projections) much less urgent.