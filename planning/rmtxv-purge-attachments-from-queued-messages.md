---
data:
  priority: high
  status: done
  type: bug
id: rmtxv
title: Purge attachments from queued messages
---
In a focused domain test, a PNG was queued behind a running turn. After the turn failed and the workspace was archived and purged, the active image store still returned the PNG. Collect image IDs from workspace history, including undelivered and dequeued messages. Preserve shared blobs and the last purge backup (FDR-014, 5mj73).

The workspace projection tracks all attachment IDs across replay. Regression coverage checks failed turns, withdrawn messages, and IDs still used by another workspace.