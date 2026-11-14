---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: feature
id: n02ab
title: Run agents by wrapping claude -p and codex
---
Spawn `claude -p --output-format stream-json` (and later `codex`) as subprocesses, persist their events, and stream progress to the UI.

Note: `query.live` keeps only the latest value; stream current state or a tail, or add a dedicated SSE endpoint for a full event stream.

## Outcome (PoC)

Built per ADR-002: daemon (`apps/daemon`) with `claude` and `codex` adapters, one Git worktree and branch per session under `~/.geordi/worktrees/`, chat UI in the forge with live updates, stop, and resumed follow-up turns. Verified end to end against a clone of means: Claude edits, Codex commits inside its sandbox, stop kills the turn, and a crashed daemon's lost turn is marked failed on reconnect.
