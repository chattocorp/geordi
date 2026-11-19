---
data:
  priority: normal
  status: done
  type: task
id: p7xqd
title: Remove the desktop system install job
---
Removed the system installer and its Run action. The web job uses the reset job’s port for browser updates. Existing workspaces have room for both spare Electron ports even with the retired job assignment. Verified the workspace configuration, types, lint and tests.