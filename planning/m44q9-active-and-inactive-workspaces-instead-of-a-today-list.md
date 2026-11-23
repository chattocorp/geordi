---
data:
  priority: normal
  status: done
  type: feature
id: m44q9
title: Active and inactive workspaces instead of a Today list
---
The sidebar's Today filter (activity since local midnight, plus "Remove from Today", hssfj, kzxka) was replaced by marking workspaces inactive by hand: Mark as inactive / Mark as active in a workspace's context menu, and prompting makes it active again. The sidebar shows only active workspaces by default (activity toggle, Cmd/Ctrl+Shift+A); turned off, inactive ones show with a muted title. Workspaces started by an inactive one (any depth) are hidden with it, derived in withoutInactive (family.ts), not stored. Old workspace.setAside events are read as workspace.deactivated (legacy.ts). Rows of icon buttons got the `tools` utility (gap-px). FDR-001 updated.