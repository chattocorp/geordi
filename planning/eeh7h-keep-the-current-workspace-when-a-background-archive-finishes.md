---
data:
  priority: normal
  status: done
  type: bug
id: eeh7h
title: Keep the current workspace when a background archive finishes
---
The workspace and sidebar archive actions now check the current page after archiving. Regression tests verify that switching away preserves the selected workspace and that staying on the archived workspace opens its parent or New Workspace.