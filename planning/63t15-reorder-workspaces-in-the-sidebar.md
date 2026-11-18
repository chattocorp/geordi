---
data:
  priority: normal
  status: done
  type: feature
id: 63t15
title: Reorder workspaces in the sidebar
---
Workspaces are never reordered automatically (newest first). Let people move them by hand.

Outcome: `workspace.moved` event (`{ id, before }`: above another of the repository's, or last). The projection keeps the order; the sidebar drags top-level rows (those started by an agent follow their parent), with an accent line where the row would land.