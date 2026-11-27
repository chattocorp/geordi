---
data:
  priority: normal
  status: in_progress
  tags:
    - outline
  type: feature
id: x7phm
title: 'Outline: the Plan window, a workspace''s scope as a tab (FDR-019)'
---
A workspace window (`plan`) showing the workspace's scope (FDR-019): its items, editable as in the sidebar, and its child agents as rows. Lives in the side area by default; like every window but `chat`, it can be dragged into the main area, where it reads well at full width.

## Acceptance

- Items in the scope can be written, nested, reordered, ticked off and removed with the same keys as in the sidebar.
- Child workspaces show as rows that lead to them; their own items are not shown.
- Works small (side/dock) and wide (main area).
- One outline editor shared with the sidebar; no second implementation.
