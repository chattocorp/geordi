---
data:
  priority: normal
  status: done
  type: feature
id: 5re8s
title: 'Folders and todos: two kinds of outline item, todos in the Plan only'
---
An item without a workspace is a todo under a workspace and a folder elsewhere (derived, `isTodo`; FDR-019 decision 1a). The sidebar shows folders and workspaces (`withoutTodos`); todos show in their workspace's Plan window only. Only todos are ticked off.

Outcome: done on branch `geordi/folders-and-todos`. New workspaces no longer start folded (nothing is written under them in the sidebar any more). Open, if missed later: a stored kind, for folders under a workspace that show in the sidebar.