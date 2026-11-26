---
data:
  priority: normal
  status: in_progress
  tags:
    - sidebar
    - outline
  type: feature
id: 9db62
title: 'Outline stage 1: items domain, migration and outliner editing (FDR-017, ADR-016)'
---
Stage 1 of FDR-017 (`docs/fdr/FDR-017-the-outline.md`), on the decision in ADR-016 (`docs/adr/ADR-016-outline-items.md`): the outline becomes a tree of items, and workspaces are attached to items. Builds on FDR-016 (`02ehk`).

## Scope

- **Items domain** (`items.ts`): events for created, edited (text, note), moved (parent, position), completed / reopened, deleted, attached (workspace). Projection and command functions, check-then-append synchronous.
- **Workspaces attached to items:** creating a workspace creates its item in the same append (the agent API's `start_agent` too, under the caller's item). The item's text is the workspace's name, both ways (`rename`, `name_workspace`, titles from the agent).
- **Authority from items:** a workspace's parent is the workspace of the nearest item above its own that has one. Messaging, reports, questions, archiving, inactivity and the agent API's reach use it instead of `parentId` on the workspace.
- **Migration on replay:** each existing workspace gets an item under its parent's item; `workspace.moved` becomes a move of that item. Purging takes the items of purged workspaces with them (ADR-012).
- **Archiving** ticks the workspace's item off; the item stays and links to the archived conversation. "Hide done" in the sidebar.
- **Sidebar = outline editor:** items without workspaces as rows; Enter for a new item, Tab / Shift-Tab, Alt-arrows, Space to tick off, Backspace on an empty item to remove it; text saved on Enter or blur. Dragging as in FDR-016. One component, so a full-width page can reuse it later.
- **Starting a workspace on an item:** from an item without a workspace; its text becomes the first message.
- **Grouping by repository is dropped:** a workspace's repository shows as its icon; the repository filter stays.
- **Docs:** FDR-017 Active for stage 1; FDR-016 and AGENTS.md updated; release notes.

## Acceptance

- A person can write, nest, reorder, tick off and remove items in the sidebar with the keyboard alone.
- An existing installation's workspaces appear in the same tree as before, now as items.
- Moving an item moves the workspaces under it, with supervision as FDR-016 defines it, items without workspaces in between not counting.
- Starting a workspace on an item attaches it there, named after the item.
- Everything survives a forge restart.

## Out of scope (later stages)

- Stage 2: a workspace's scope (its tab, agent tools, checklist in its instructions).
- Stage 3: delegation onto items, the path as a brief, agents' plans as items.
- A full-width outline page.

## Progress (2026-11-26)

Implemented on `geordi/outline-items`, not yet committed:

- Item ID = workspace ID; the outline lives in the workspaces' projection, and a workspace's `parentId` is derived from it (so no translation of old events, and no changes to callers). `item.*` events for items without workspaces.
- Ticking off is Cmd/Ctrl-Enter, not Space (the line is always editable, so Space types). "Show only what is active" also hides done items; the line being edited stays.
- Starting a workspace on an item: from its menu, via `/?item=`; only on items with no workspaces under them (staffing a folder that already has work under it is for later).
- Tried in the dev app: keyboard editing, starting a workspace on an item, forge restart.

Known limits: the navigation view sends every archived workspace's item (done) to every window; may want trimming for large installations.
