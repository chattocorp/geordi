---
data:
  priority: normal
  status: done
  type: feature
id: x2yk9
title: Stop a background task from its conversation
---
The task tray has a Stop button for each task its host can stop. Tested live shell cancellation with Claude and Codex after reconnecting the daemon. Checked routing across a forge hub restart and tested that stopping one task leaves its sibling available.