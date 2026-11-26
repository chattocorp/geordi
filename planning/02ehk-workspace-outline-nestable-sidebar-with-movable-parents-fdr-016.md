---
data:
  priority: normal
  status: in_progress
  tags:
    - sidebar
  type: feature
id: 02ehk
title: 'Workspace outline: nestable sidebar with movable parents (FDR-016)'
---
Implement FDR-016 (`docs/fdr/FDR-016-workspace-outline.md`): the sidebar becomes an outline, and the outline is the chain of command. A workspace's parent is whoever supervises it now; the person can move any workspace anywhere.

## Scope

- **Forge domain:** an event that sets a workspace's place (parent and position), replacing `workspace.moved`; old `moved` events translated on replay. The command refuses loops and parents that can't reach the moved workspace's repository; it ends the old parent's waits ("moved away, no longer yours") and forwards questions routed to the old parent to the person. Nobody is messaged or woken.
- **Authority:** everything that reads `parentId` (messaging, stop, archive, reports, question routing) reads the current parent. Who started a workspace stays on record and is shown with it.
- **Archiving:** follows the current subtree across all repositories, with agents sharing those worktrees; all or nothing (refused, naming the workspace, if any is locked).
- **Inactive:** follows the current subtree (already follows `parentId`).
- **`family.ts`:** an outline, grouped by the root's repository when grouped; one list of trees otherwise. Specs.
- **Sidebar:** drag before, after or onto a row (the subtree moves along); fold and unfold subtrees (per-browser, `persisted`); a repository mark on rows from another repository than the tree's group; top-level rows can't change repository groups; projects stay top-level and can't be nested. Stories.
- **Instructions:** a moved agent's next turn names its current parent.
- **Docs:** when shipped, set FDR-016 to Active and rewrite FDR-002 (decisions 3 and 4, the sidebar and archiving bullets). Release note.

## Acceptance

- Dragging a workspace under another makes that agent able to message, stop and archive it, and the old parent unable to.
- Moving to the top level makes the workspace report to the person.
- A tree with children from other repositories is listed whole under its root's repository.
- Archiving a root archives its whole subtree, or nothing if one is locked.
- Survives a forge restart (event-sourced).

## Open (see FDR-016)

- Outliner keys (Tab / Shift-Tab, Alt-arrows).
- Whether moving ends an external MCP client's supervision.
