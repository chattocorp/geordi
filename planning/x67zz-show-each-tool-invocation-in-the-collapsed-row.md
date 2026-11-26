---
data:
  priority: normal
  status: done
  type: task
id: x67zz
title: Show each tool invocation in the collapsed row
---
Collapsed tool groups show one outlined square per invocation in order, with no trailing chevron. A failed call uses the danger colour and has an accessible failure label. New tiles fade in. Foreground and background calls use the composer’s moving edge while running, with a static edge for reduced motion. Verified the mixed-result row in both themes, pointer and keyboard interaction, and the running border in Chromium. The collapsed row stays icon-only during execution. Expand it to read the running command. After a turn ends, a single group of tool calls opens directly from its icons. Opening the group replaces the icon row with the call list. Busy icons in the list carry the same activity border. A chevron beside the list collapses it.