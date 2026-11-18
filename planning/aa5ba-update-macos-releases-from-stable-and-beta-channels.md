---
data:
  priority: normal
  status: done
  type: feature
id: aa5ba
title: Update macOS releases from stable and beta channels
---
Ship signed macOS update archives and channel manifests on GitHub Releases. Check in release builds, allow beta opt-in, and restart on request. Verify packaging and update behavior.

Verified signed stable and beta upgrades in an isolated macOS installation, including the restart action, saved workspace and daemon reconnect. The beta test used the ZIP and block map produced by electron-builder.

Settings → About contains channel selection, update status, manual checks and the restart action. Verified these controls in an isolated Electron window with a simulated beta download.