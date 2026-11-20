# ADR-012: Purging archived workspaces from the event log

**Date:** 2026-11-20

## Context

ADR-001 makes the event log append-only: everything that happened stays, and replay rebuilds the projections from it. Nearly all of it is agent output. On the installed app after six days, the log was 106 MB with 57,000 events. 87% of the agent output belonged to archived workspaces (412 of 441), and the log was growing by about 25 MB a day. Startup replay (about 250 ms) and disk use both grow with it, mostly for conversations nobody will read again.

Alternatives considered:

- **Skip archived transcripts during replay** (planning n7myp). It helped less than expected: SQLite still reads the skipped rows. The version that avoided reading them needed a second table and a backfill. Disk use would not change.
- **Persist projections with a checkpoint** (ADR-001's later optimisation). This bounds startup time, but not the size of the log.
- **Delete only an archived workspace's agent output** and keep its title and messages. This frees most of the space, but leaves a workspace that can be restored with only one side of its conversation.

## Decision

- A person may **purge** archived workspaces: their events are deleted from the log for good. This is the one exception to append-only. Only a person does it, from the archive. No agent or automatic rule does.
- `EventStore.purge(streams, record)` deletes whole streams and appends a `record` in one transaction. Then it runs `VACUUM`, so the file actually gets smaller.
- **Projections see only the record.** It must tell them what to let go of, and what the deleted events still mean to the state that stays. For workspaces, `workspace.purged` (in the one stream `purges`) records:
  - the IDs and titles of the purged workspaces;
  - the `seq` each was created at, so that what their agents said in other workspaces stays attributed to them on replay (it is read before replay);
  - the worktree of any owner that stays, where a purged agent working alongside it was the one that last said where its worktree is.
- A workspace is purged with its **family**: every workspace in its worktree and every agent it started, all of which must be archived. Otherwise nothing is deleted.
- Images sent to purged workspaces go with them. A blob goes once no remaining image uses it.
- Git branches and project folders are not touched.

## Consequences

- People can trim the log. Purging everything archived took the installed app's log from 106 MB to 13 MB, and startup replay from about 250 ms to about 30 ms. This makes n7myp much less urgent.
- History is no longer complete. What is purged is gone, apart from the record that it was, by whom and when. Backups are the only way back.
- Anything a projection derives from a workspace's events for _another_ workspace must be carried in the purge record. A new cross-workspace effect in the reducer needs to be added there, or purging will lose it.
- Older versions of Geordi read a purged log without trouble: the streams are missing, and `workspace.purged` is ignored as an unknown type.
- `VACUUM` blocks the forge for as long as it takes to rewrite the file: under half a second for the installed app's log.
