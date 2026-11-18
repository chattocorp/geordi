# FDR-010: Native subagents in a conversation

**Status:** Active
**Last reviewed:** 2026-11-18

## Overview

An agent can delegate work through its own provider. Each subagent appears where the parent assigned the work.

## Behavior

- Each row shows the subagent's name and latest reported state. Expand it to read its assignment, tool calls, messages and report.
- Select **Open in tab** inside an expanded row to follow that reviewer in the main pane. Opening it again focuses its existing tab. Closing the tab leaves the reviewer running.
- Parallel reviewers update independently. A subagent can finish after the parent replies. Its row stays in the original turn.
- When a subagent delegates again, its own transcript contains the next subagent.

## Design Decisions

### 1. Keep delegated work with the assignment

**Decision:** Show a read-only disclosure in the conversation. Keep it visible when the turn's other activity folds away.
**Why:** People can see who is still working and inspect a result in context. The provider owns the child session.
**Tradeoff:** Reading a nested review requires opening its parent.

## Gates

The provider must report child sessions through ACP.

## Related

- **ADRs:** ADR-001, ADR-010
- **FDRs:** FDR-001, FDR-002
