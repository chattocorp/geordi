# FDR-016: The workspace outline

**Status:** Active
**Last reviewed:** 2026-11-26

## Overview

The sidebar is an outline of the person's workspaces, and the outline is the chain of command. A workspace's parent is the one it reports to now, not necessarily the one that started it. An agent starting a child makes itself that child's first parent. From then on, the person can move any workspace anywhere in the outline, which hands it to another lead, or to themselves. One tree tells the person both how the work is arranged and who supervises whom.

## Behavior

### The outline

- Every workspace sits at the top level or under another workspace, in an order the person chooses.
- A workspace an agent starts sits under that agent's workspace, newest first among its siblings, until the person moves it.
- The person moves a workspace by dragging its row: onto the upper or lower part of another row to put it above or below that one, beside it, or onto its middle to put it under that workspace, as its last child. Dropped below a row with children, it becomes the first of them; dropped below the last row of a list, the last at its top level. Its children, and their children, move with it.
- A subtree can be folded and unfolded. What is folded is a preference of this browser, not part of the outline.
- An agent working in another workspace's worktree (shown as a conversation tab there, FDR-002) is not a row of its own and is never moved on its own: it goes where its workspace goes.
- Projects (FDR-012) stay at the top level and can't be nested or have workspaces nested under them.

### Grouped by repository, and not

- Grouped, each top-level workspace is listed under the heading of its repository, with its whole subtree, even where a workspace in it belongs to another repository. Such a row is marked with its own repository.
- A top-level workspace can't be dragged into another repository's group, because its repository decides its group. Anything nested can be moved under any workspace in any group.
- Ungrouped, the top-level workspaces are one list, each with its subtree.

### Who supervises whom

- An agent can message, stop and archive only its current children and their descendants. It reports to, asks and messages only its current parent. Who started a workspace stays in its history, but grants nothing.
- Moving a workspace to the top level means it reports to the person: its questions come to them, and no agent supervises it.
- A workspace an MCP client outside Geordi started (FDR-002) is supervised by that client until a person moves it under another workspace or to the top level; from then on, by its place in the outline only.
- A workspace can't be moved under one of its own descendants.
- A workspace can be moved under another only if that workspace's agent can reach the moved workspace's repository.

### When a workspace moves

- Moving wakes nobody. A person who wants the new lead to do something with it tells them so.
- The new parent sees the workspace among its agents whenever it looks. It is told when a turn ends only for turns it began itself, so a turn that was already under way when the workspace moved is reported to nobody.
- An old parent waiting for the workspace (`wait_for_agent`) gets the answer that the workspace was moved away and is no longer its to supervise. Messages it tries to send afterwards are refused, saying the same.
- A question the workspace had put to its old parent goes to the person, as it does when a parent is archived.
- The moved workspace's agent learns who its parent is now when its next turn begins.

### Putting aside and archiving

- Marking a workspace inactive puts its whole current subtree aside with it.
- Archiving a workspace archives its whole current subtree, in every repository, together with agents working in their worktrees. Busy agents are stopped first. It is all or nothing: if any workspace in the subtree can't be archived (it is locked, FDR-015), nothing is archived and the person is told which one.

## Design Decisions

### 1. The outline is the chain of command

**Decision:** There is one tree: where a workspace sits in the sidebar is who it reports to.
**Why:** A second relation, one the sidebar shows and another that decides who reports to whom, would be a hidden concept: a workspace would sit under one lead while answering to another. Geordi prefers one fixed way to a second, invisible one.
**Tradeoff:** Rearranging the sidebar is never cosmetic. A drag gives an agent power over a workspace (to message, stop and archive it), so the drop has to be deliberate and clearly shown.

### 2. Only the person moves workspaces

**Decision:** Agents start children, which places them, but can't move workspaces or hand them to another lead.
**Why:** Who works for whom is the person's arrangement. It keeps the guarantee of ADR-004 and FDR-002 that an agent's reach comes from what it was given, never from what it declares.
**Tradeoff:** A lead that wants to hand a child to a peer must ask the person to do it.

### 3. A move wakes nobody

**Decision:** Neither the old nor the new parent is sent a message when a workspace moves. The old parent learns of it only when it next waits for or messages the workspace.
**Why:** The move is the person's act. If the new lead should act on it, the person says so in the same breath. Telling agents unasked would start turns, and spend tokens, for nothing.
**Tradeoff:** A new parent may not know it has a child until it looks, or until it is told.

### 4. A tree belongs to its root's repository

**Decision:** Grouped by repository, a subtree is listed in its top-level workspace's repository, whatever repositories its workspaces are in.
**Why:** A tree is one piece of work, and is read as one. Splitting it across repository headings, as the sidebar used to, tears a lead away from its children.
**Tradeoff:** A repository's heading doesn't show all of that repository's workspaces. Workspaces from elsewhere are marked, but a workspace of this repository nested in another's tree is listed there.

### 5. Archiving takes the subtree, all or nothing

**Decision:** Archiving follows the current subtree into every repository, and refuses entirely if any part of it can't be archived.
**Why:** The person decides the subtree, so archiving it is archiving what they put together. A partial archive would leave a tree with holes, and children under a parent that is gone.
**Tradeoff:** Work in another repository that the person wanted kept must be moved out of the tree first. One locked workspace holds up the whole archive.

### 6. Limits apply to starting, not to moving

**Decision:** The nesting depth and concurrent-children limits (FDR-002) bound what agents start. The person's moves are not checked against them.
**Why:** The limits stop runaway delegation by agents. A person who builds a deeper tree means to.
**Tradeoff:** A tree can be deeper than an agent could have made it, and an agent can have more children running than it could have started.

## Gates

- An agent can be made a workspace's parent only if it can reach that workspace's repository.

## Related

- **ADRs:** ADR-001, ADR-004, ADR-016
- **FDRs:** FDR-001, FDR-002, FDR-012, FDR-015, FDR-017 (planned: the outline of items it grows into)

## Open Questions

- Outliner keys: Tab and Shift-Tab to nest and unnest, Alt with the arrows to move a row.
- Should a lead ever be able to hand a child to a peer itself?
