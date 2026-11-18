---
data:
  priority: normal
  status: done
  type: bug
id: m1r78
title: Restore the uncommitted changes ribbon status
---
Every workspace ribbon action has an outer status. Local edits show Uncommitted changes, a pushed branch awaiting a PR shows Branch pushed, and a standalone Sync shows Behind base branch. Verified status coverage across Git and pull request state combinations and rendered the three cases in Chromium.