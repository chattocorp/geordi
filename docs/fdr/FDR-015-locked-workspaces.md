# FDR-015: Locked workspaces

**Status:** Active
**Last reviewed:** 2026-11-21

## Overview

Some workspaces are meant to last: a release workspace, a scratchpad, one that carries on from branch to branch. A person can lock such a workspace so that it can't be archived by mistake, by them or by an agent, until they unlock it.

## Behavior

- In the sidebar, right-click a workspace and choose **Lock**. **Unlock** undoes it. The workspace's command palette has **Lock workspace** and **Unlock workspace**.
- A locked workspace's sidebar row shows a lock in its status slot, only while it has no other status: no agent at work, no question, nothing running in the background, and nothing to say about its work (a pull request, its checks). A status is never hidden by the lock.
- Geordi doesn't offer to archive a locked workspace. Archive isn't in its context menu, its ribbon or its next steps. If something else would have been offered next to Archive (**Continue** after a merge, **Sync**), that becomes the next step.
- Archiving takes along the agents a workspace started and those working in its worktree. If any of them is locked, nothing is archived, and Geordi names the locked workspace.
- Agents can't archive a locked workspace either. The agent API refuses, and it has no way to lock or unlock.
- A lock lasts until a person unlocks the workspace, across restarts. Archived workspaces, and workspaces being archived, can't be locked.
- An agent working alongside in another workspace's worktree (a conversation tab there) isn't locked on its own. Locking the workspace it works in keeps that workspace and its worktree; the agent's own conversation can still be closed.

## Design Decisions

### 1. Locking only protects against archiving

**Decision:** A locked workspace works as before: you can message it, its agent can commit and push, and it can carry on to a new branch. Only archiving is blocked.
**Why:** The risk is losing a long-lived workspace by archiving it. Nothing else needs protecting, and a read-only mode would be a second way of working.
**Tradeoff:** "Lock" might suggest more than it does. The lock icon's tooltip says what it means.

### 2. Only a person locks and unlocks

**Decision:** There is no agent tool for locking or unlocking.
**Why:** If an agent could unlock, it could also archive, and the lock would mean nothing (FDR-002 lets agents archive what they started).
**Tradeoff:** An agent that runs a long-lived workspace can't lock it for itself.

### 3. A locked member stops the whole archive

**Decision:** Geordi refuses to archive a workspace if any workspace that would go with it is locked. It doesn't skip the locked one.
**Why:** A locked agent may share the worktree that is about to be removed. Refusing works the same way as an agent that is still working.
**Tradeoff:** To archive the parent, you first unlock the child, or archive around it.

### 4. The lock only shows when there's no status

**Decision:** The lock appears in the row's status slot, and only when the workspace has no other status.
**Why:** The row gets no extra icon, and the lock never hides a status, which matters more day to day.
**Tradeoff:** A locked workspace with an open pull request doesn't show its lock in the sidebar. Its context menu says Unlock.

### 5. Archive isn't offered, not just disabled

**Decision:** A locked workspace has no Archive item anywhere. There's no greyed-out one.
**Why:** A calm UI shows what can be done (CLAUDE.md invariants). Unlocking is right there in the same menu.
**Tradeoff:** Someone who forgot the lock may wonder where Archive went. The context menu offers Unlock in its place.

## Related

- **ADRs:** ADR-001 (the lock is an event)
- **FDRs:** FDR-001 (workspaces), FDR-002 (agents archiving agents), FDR-003 (workspace actions)
