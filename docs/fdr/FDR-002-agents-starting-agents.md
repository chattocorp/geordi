# FDR-002: Agents starting and supervising agents

**Status:** Active
**Last reviewed:** 2026-11-14

## Overview

An agent working in a workspace can start further agents, give them tasks, wait for them, read what they produced and stop them. This lets one agent act as a lead that splits up work, delegates and integrates, while people see at a glance who is controlling what.

## Behavior

- An agent can start a child agent (of the same kind as itself, or another) in one of two ways, and chooses per child:
  - **In the same workspace:** the child is another session sharing the parent's files, for work that needs to see uncommitted state (reviewing, pairing).
  - **In a sub-workspace:** the child gets its own worktree and branch, branched from the parent workspace's branch, for work that should not interfere (parallel tasks).
- The parent can message a child, wait until it has finished its turn, read its latest reply, and stop it. Children can start children of their own, up to a limit.
- An agent can only see and control the agents it started, directly or indirectly.
- Work from a sub-workspace comes back by the parent merging the child's branch. Geordi does not merge on its own.
- The sidebar shows workspaces as a tree by who started what, not grouped by repository. The repository is shown on each workspace. A parent shows as working while any of its descendants is.
- Inside a workspace, sessions started by an agent are marked as such and name their parent. They get a tab as they appear, without taking focus. A sub-workspace links back to the workspace it was started from, and its changes are measured against that workspace's branch.
- People can open, message and stop any child like any other session.
- Limits on nesting depth and on the number of children running at once stop runaway delegation; hitting one is reported to the calling agent as an error it can act on.

## Design Decisions

### 1. Both sharing and isolating are first-class

**Decision:** A child either shares its parent's worktree or gets its own; the parent decides each time.
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
- **FDRs:** FDR-001

## Open Questions

- Workspaces that span several repositories (one worktree per repository in one workspace directory).
- Whether a named "project" level above workspaces is needed, or the tree is enough.
- Budgets (tokens, time) per subtree rather than only counts.
