---
data:
  priority: normal
  status: done
  type: feature
id: rxvq3
title: Lock workspaces against archiving
---
A person can lock a workspace so that it can't be archived (not offered in the UI, refused for the agent API) until they unlock it. Locked rows show a lock icon in the sidebar while inactive. Design: FDR-015.

Outcome: `workspace.locked`/`workspace.unlocked` events; archive refuses when any affected workspace is locked; Lock/Unlock in the sidebar context menu and the workspace command palette; no MCP tool.