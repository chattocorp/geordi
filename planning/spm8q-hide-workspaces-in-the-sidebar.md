---
data:
  priority: normal
  status: done
  type: feature
id: spm8q
title: Hide workspaces in the sidebar
---
Hide a workspace from the sidebar without archiving it; hidden ones sit under "Show N hidden" in their repository.

Outcome: `workspace.hidden` event (does not touch `updatedAt`), `workspaces().hide()`, `hideWorkspace` command. Sidebar: eye-off button on hover and "Hide"/"Show in sidebar" in the context menu; hidden workspaces (and what their agents started) collapse under "Show N hidden"; a hidden one stays in sight only while its agent asks. The overview still shows everything. FDR-001 updated.