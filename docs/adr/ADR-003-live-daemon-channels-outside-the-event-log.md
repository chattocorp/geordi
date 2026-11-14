# ADR-003: Live daemon channels outside the event log

**Date:** 2026-11-14

## Context

ADR-001 makes the event log the home of all state, and ADR-002 has daemons report what agents do as events the forge stores. Workspaces add two things that don't fit that mould:

- **Questions about a worktree** (which files changed, what a file's diff is). The answer lives in Git on the daemon's machine and changes behind the forge's back, whenever an agent or the user's terminal touches a file.
- **Terminal I/O**. A shell produces a high-volume byte stream that is only meaningful while someone is looking at it.

Storing either in the event log would bloat it with data that is derived (Git already is the source of truth for changes) or ephemeral (terminal output), and replaying it would rebuild nothing useful.

## Decision

- The forge may ask a daemon **requests** over the existing WebSocket: one question, one answer, matched by ID. Answers are never stored; the forge asks again when it needs fresh data.
- **Terminal I/O** flows over the same WebSocket as plain messages, not events. The forge keeps only a bounded, in-memory scrollback per workspace so late or reconnecting viewers can catch up.
- The event log remains the only place for durable state. Anything that must survive a restart, or that a projection depends on, still goes through `store().append(...)`.
- Daemons end their shells when the connection to the forge drops, since the scrollback is gone with it. Agent turns are unaffected (ADR-002).

## Consequences

- The event log stays small and meaningful; changes are always as fresh as Git.
- Changes and the terminal need a connected daemon, and say so when there is none.
- Terminal history is lost when the forge restarts, and shells don't survive a reconnect.
- The daemon runs Git in worktrees that agents can write to. It must never trust the worktree's own Git metadata or per-worktree config (it runs Git against the repository's own `.git` with the worktree's files and index) and never run repository-defined diff drivers.
- The terminal is the user's own unsandboxed shell in such a worktree. Shells start only when a person asks for one. The daemon re-checks the worktree's Git metadata before passing on any input, and ends the shell if it was tampered with; this narrows the risk but cannot remove it.
- A terminal gives whoever can reach the forge a shell on the daemon's machine. That is the same trust as running agents there, and stays gated by the forge only listening locally until authentication exists.
