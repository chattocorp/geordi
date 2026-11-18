---
data:
  priority: normal
  status: done
  type: feature
id: e6m76
title: Open native subagent activity in a workspace tab
---
An expanded subagent offers Open in tab. The read-only tab uses the same conversation view and tab component as regular agents. It shows delegated assignments, grouped tool calls, nested reviewers and reports. Verified open, refocus, close, reopen, selected tab after reload and a forge restart. Chromium also verified the conversation activity disclosure and tool details with recorded Claude output. See FDR-010. A branch icon marks native subagents. The assignment names the delegating agent and opens its conversation. Verified nested navigation through a closed parent tab back to the root.