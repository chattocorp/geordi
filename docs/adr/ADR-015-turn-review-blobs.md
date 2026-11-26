# ADR-015: Keep turn review context in Git

**Date:** 2026-11-26

## Context

Turn reviews compare the worktree at two boundaries. Both can include uncommitted edits. Saving whole files in the event log repeats unchanged lines across turns.

## Decision

Save a bounded compact patch, file summary and the before and after Git blob IDs for changed text files. The detached host retains those blobs in the repository under a workspace-specific ref to a tree of their IDs. Identical versions share storage. The tree excludes other worktree files and binary changes.

When someone opens a turn review, the forge looks up the recorded IDs for each visible file and asks the daemon for the blobs. Older compact patches can supply abbreviated IDs when Git still has an unambiguous match. Previously saved full-context patches remain self-contained.

## Consequences

An archived workspace keeps its refs when its worktree is removed. Permanent deletion releases its refs and Git can reclaim unreachable objects during normal maintenance. The forge replays purge records on daemon reconnect. Restoring an old event-log backup restores the compact patches. Extra context depends on the Git objects still being available.

An offline review uses the saved patch. If that patch exceeded the event limit, the file list and counts remain available.
