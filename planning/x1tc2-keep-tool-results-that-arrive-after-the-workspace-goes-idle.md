---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: bug
id: x1tc2
title: Keep tool results that arrive after the workspace goes idle
---
The forge now attaches an idle tool result to its unfinished transcript entry once. Verified duplicate delivery, unknown IDs and projection replay. In an isolated Codex workspace, restarted the forge after the foreground turn and verified the background command output on the original tool call in Chromium.