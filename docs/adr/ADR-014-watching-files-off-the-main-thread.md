# ADR-014: The daemon watches files in a thread of its own, once per repository

**Date:** 2026-11-23

## Context

The daemon watches every worktree in use (ADR-003, `watch.ts`): the Git state of all of
them, for the sidebar, and the files of the ones someone has open. It did so with Node's
`fs.watch` on its main thread, five watchers per worktree, among them the repository's own
Git directory and its `refs`, once for each of its worktrees.

On macOS, Node runs a thread's `fs.watch` watchers through one FSEvents stream and
rebuilds it whenever one of them stops; the thread waits for that. With some fifty
worktrees in use, each stop held up the daemon for 60–580 ms. Opening a workspace changes
what two worktrees are watched for, which stopped some ten watchers: the daemon answered
nothing for a second or two. What showed it first was a workspace's tasks, which wait for
the daemon to read the repository's configuration.

`@parcel/watcher` (which the file index uses) starts and stops its watchers without
holding up the thread, but on a busy machine (agents writing files, a backup) it reported
changes seconds later than `fs.watch`, or not within six seconds at all.

## Decision

- The daemon's watchers live in a worker thread (`watch-worker.ts`), which tells the main
  thread what changed. Only that thread waits for FSEvents (10 starts and stops among 50
  watchers held up the main thread for 905 ms before, for 2 ms in a worker).
- A repository's Git directory is watched once for all of its worktrees in use: the
  directory's own files, `refs/`, `worktrees/` and `info/` (never `objects/`). What
  happens there is routed to the worktrees it concerns (`route` in `watch.ts`).
- A worktree's files are watched on top of that while someone has it open. Opening it or
  letting go of it starts or stops that one watcher, and nothing else.
- The daemon says in its log when its main thread was held up for 200 ms or more
  (`stalls.ts`), so that the next cause of this kind shows itself.

## Consequences

- Switching workspaces no longer holds up the daemon. The watchers grow in number with
  the repositories and the open worktrees, not with every worktree in use.
- Changes are reported as soon as they were before: it is the same `fs.watch`.
- Nothing long-lived in the daemon watches files on its main thread.
- The staged daemon has one more entry point (`@geordi/launch`).
