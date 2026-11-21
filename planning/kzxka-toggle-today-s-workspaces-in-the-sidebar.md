---
data:
  priority: normal
  status: done
  type: feature
id: kzxka
title: Toggle today's workspaces in the sidebar
---
Cmd/Ctrl+Shift+T toggles workspaces with activity on the current local calendar day. Keyboard navigation follows the visible list.

Verified the toggle and local midnight rollover with both Mac and Linux shortcuts in the running forge.

The sidebar now has a repository picker and calendar button at the top. New workspace is the first link in the bottom menu. Browser stories cover selecting a repository while Today is active, the empty result, and clearing each filter. Cmd+Option+F on Mac or Ctrl+Alt+F elsewhere opens repository search. Verified keyboard selection with the sidebar open and collapsed.

The sidebar menu offers Not Today on workspaces active today. Verified in the running forge that a deferred row stays in the full list, stays hidden from Today after a restart, and returns when you send a prompt.

Today also accepts workspace drops on Set aside. The grouped view shows one target and count per expanded repository. The flat view shows one for the current filter. Verified a native drag in the running forge, including rejection by another repository and the count after dropping the last workspace.

Set aside uses a muted dashed border. Expand it to open a deferred workspace while Today stays on. Verified opening a workspace and collapsing the list from the keyboard in the running forge.

Revealed workspaces use the regular sidebar rows. Verified matching typography and row height in grouped and flat views, with status indicators visible under Set aside.

Drag a workspace out of Set aside to return it to Today, or use Return to Today in its menu. Verified a drop into an empty repository list and onto an active workspace in flat view. Returning the workspace keeps its conversation and agent state.

Today and Set aside share row reordering. Verified exact insertion positions within and across both lists in the running forge, including the flat view. The move records the new order and Today membership together.

Holding a dragged workspace over the closed Set aside header for 500 ms opens it. Verified that leaving early cancels expansion and that the same drag can insert a workspace between two revealed rows.

A Set aside list opened by hovering closes when the drag ends. Verified a drop and Escape cancellation in the running forge, and that a manually opened list stays open.
