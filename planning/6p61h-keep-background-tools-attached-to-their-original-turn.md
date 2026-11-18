---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: bug
id: 6p61h
title: Keep background tools attached to their original turn
---
The ACP host keeps tool IDs across turns and preserves buffered terminal output for unfinished calls. It also reads the full Codex command output when the wrapper sends a text block with a separate exit code. Verified duplicate completion and both output formats in a two-turn regression. In Chromium a live Codex command finished during the next turn, after forge and daemon restart, and showed its output once on the original call.