# FDR-002: Agents starting and supervising agents

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

An agent working in a workspace can start further agents, give them tasks, wait for them, read what they produced and stop them. This lets one agent act as a lead that splits up work, delegates and integrates, while people see at a glance who is controlling what.

## Behavior

- An agent can start another agent (of the same kind as itself, or another). The new agent is a workspace of its own, with its own conversation, and works in one of two places, as the parent decides each time:
  - **Its own worktree:** a new worktree and branch, branched from the parent workspace's branch, for work that should not interfere (parallel tasks).
  - **The parent's worktree:** the same directory as the parent, for work that needs to see uncommitted state (reviewing, pairing).
- The parent can message a child, wait until it has finished its turn, read its latest reply, stop it, and archive it once it is done with it (after merging its branch, say). Archiving on an agent's behalf never discards uncommitted work. Children can start children of their own, up to a limit.
- A message to a child that is working waits for its turn to end; the parent can have it interrupt instead, which stops what the child is doing and gives it the message at once. In the child's conversation, what an agent said is marked as that agent's, by its workspace's name.
- The parent can give the new agent's workspace a name when it starts it; otherwise the child names itself, like any workspace.
- An agent can only see and control the agents it started, directly or indirectly.
- Work from a child with its own worktree comes back by the parent merging the child's branch. Geordi does not merge on its own.
- The sidebar lists every repository, and under each its workspaces, as a plain list. A workspace started by an agent is marked as such and comes right after the one that started it; pointing at it lights that one up.
- A workspace's page says who started whom, under its title: the workspace whose agent started it (and whether it works in that one's directory), and the workspaces its own agent started, each with its status and a link. Its changes are measured against the parent's branch.
- An agent working in another workspace's directory is shown in that workspace, not beside it: as a conversation of its own next to the workspace's (a tab with its name, which turns while it works), and not in the sidebar or among the workspaces started. The workspace shows as working while any of its agents is. A link to such an agent leads to its conversation there. Closing the tab of one that is not working archives it. Once the workspace it worked in is archived, it stands for itself.
- People can add an agent to a workspace too: the "+" beside its conversations opens a new one, begun as a workspace is, by writing what to do and choosing who does it and how. The agent is there once that is sent, working in the same directory. It belongs to the workspace like one an agent started there, and goes when the workspace is archived.
- People can open, message and stop any child like any other workspace.
- Limits on nesting depth and on the number of children running at once stop runaway delegation; hitting one is reported to the calling agent as an error it can act on.
- Archiving a workspace archives the workspaces its agent started along with it: they are part of the same piece of work.
- A worktree that several workspaces work in is only removed once the last of them is archived.

## Design Decisions

### 1. Both sharing and isolating are first-class

**Decision:** A child is always a workspace of its own; it either works in its parent's worktree or gets its own, and the parent decides each time.
**Why:** Reviewing needs the parent's uncommitted files, parallel implementation needs isolation. Neither default fits both.
**Tradeoff:** Agents sharing a worktree can step on each other's edits, and the lead has to choose well.

### 2. Sub-workspaces branch from the parent, and the parent integrates

**Decision:** A sub-workspace starts from the parent workspace's branch, and merging its result is the parent's job.
**Why:** The child should build on what the parent has done so far, and the lead is the one who knows how the pieces fit.
**Tradeoff:** The child only sees what the parent has committed. Uncommitted work stays invisible to it.

### 3. Parentage is recorded, not declared

**Decision:** Who started a child is taken from who made the call.
**Why:** See ADR-004. The tree in the sidebar must be trustworthy.
**Tradeoff:** A child can't be re-parented or adopted later.

### 4. The sidebar follows control, not repositories

**Decision:** Workspaces are no longer grouped by repository.
**Why:** The interesting structure is who is driving what, and work will span several repositories.
**Tradeoff:** Finding "everything in repository X" takes a filter or the repository's own page instead of a glance at the sidebar.

## Gates

- Nesting depth limit (3 by default) and concurrent-children limit per agent (5 by default), both set by the person running the forge. A depth limit of 0 turns the feature off.

## Related

- **ADRs:** ADR-001, ADR-002, ADR-004
- **FDRs:** FDR-001, FDR-003

## Open Questions

- Workspaces that span several repositories (one worktree per repository in one workspace directory).
- Whether a named "project" level above workspaces is needed, or the tree is enough.
- Budgets (tokens, time) per subtree rather than only counts.
