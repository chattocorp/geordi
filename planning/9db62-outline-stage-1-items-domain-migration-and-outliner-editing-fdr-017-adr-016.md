---
data:
  priority: normal
  status: done
  tags:
    - sidebar
    - outline
  type: feature
id: 9db62
title: 'Outline stage 1: items domain, migration and outliner editing (FDR-019, ADR-016)'
---
Stage 1 of FDR-019 (`docs/fdr/FDR-019-the-outline.md`), on the decision in ADR-016 (`docs/adr/ADR-016-outline-items.md`): the outline becomes a tree of items, and workspaces are attached to items. Builds on FDR-016 (`02ehk`).

## Outcome (2026-11-27)

Shipped in PR #558, together with stages 2 and 3:

- Items domain (`items.ts`), kept by the workspaces' projection; a workspace's `parentId` is derived from the outline. Existing installations replay unchanged (verified against a real event log of 1017 workspaces).
- The sidebar is one outline editor: Enter, Tab / Shift-Tab, Alt-arrows, Cmd-Enter to tick off, Backspace on an empty line; drag and drop with one place per gap and depth by pointer. "New item" row and a hover "+" on rows. Ticked items stay, crossed off.
- Archived workspaces stay only inside trees still in use.
- Stage 2: agents keep the items in their scope (`list_items`, `add_item`, `move_item`, `update_item`, `remove_item`), see them every turn, and are asked to write their plan there.
- Stage 3: `start_agent` with `item` (the item becomes the workspace) or `under`.
- Grouping by repository dropped.

Follow-ups: the Plan window, a new-item shortcut, zooming into a branch, a quick filter (see their planning items).
