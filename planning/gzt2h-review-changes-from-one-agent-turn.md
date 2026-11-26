---
data:
  priority: normal
  status: done
  type: feature
id: gzt2h
title: Review changes from one agent turn
---
Capture the net worktree change across each agent turn and open its historical diff from the conversation.

Completed in FDR-001. Verified two consecutive changes to one file in the workspace UI after a forge restart. Git and detached-host tests cover pre-existing edits, commits, ignored files, steering, reconnects, empty turns and large patches.

The reply footer identifies single-file edits by name. The numbered review tab shows a total and lets you collapse each text diff independently. Verified the three-turn conversation and keyboard file toggles in the running forge.

Turn reviews save full text context within the existing patch size limit. The same viewer used for workspace diffs expands the saved lines. Browser and daemon tests cover expansion and the compact patch fallback.
