---
data:
  priority: normal
  status: in_progress
  tags: []
  type: task
id: bd2vr
title: Publish signed desktop releases
---
Publish unsigned desktop ZIPs first. After the release workflow is proven, add Developer ID signing and notarization for macOS and Azure Artifact Signing for Windows. Verify signatures before publication.

Implement macOS signing and notarization first. Windows signing is deferred.