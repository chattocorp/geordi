---
data:
  priority: normal
  status: done
  type: feature
id: hssfj
title: 'Remove from Today: set a workspace aside from the Today list'
---
A "Remove from Today" entry in the sidebar's workspace context menu (only while the Today filter is on) takes a workspace off the Today list; Shift-click on a row does the same. Event-sourced (`workspace.setAside`); the projection clears it when a person prompts the workspace (sent or queued), or an aide in its worktree. Agent activity leaves it aside. Follows kzxka.

Verified in the dev app: menu and Shift-click both hide the row; Shift-click does not navigate.