---
data:
  priority: normal
  status: done
  type: task
id: x67zz
title: Show each tool invocation in the collapsed row
---
Collapsed tool groups show one outlined square per invocation in order, with no trailing chevron. A failed call uses the danger colour and has an accessible failure label. New tiles fade in. Foreground and background calls use the composer’s moving edge while running, with a static edge for reduced motion. Verified the mixed-result row in both themes, pointer and keyboard interaction, and the running border in Chromium. The collapsed row stays icon-only during execution. Expand it to read the running command. After a turn ends, a single group of tool calls opens directly from its icons. Opening the group replaces the icon row with the call list. Busy icons in the list carry the same activity border. The list aligns with the collapsed icons. A chevron inside its upper-left corner collapses it. Collapsed icons overlap by 6 px. Each glyph fits within the visible part of its tile. Wrapped lines start at the same left edge. Each collapsed tile has a 1.5 px outline, including its running indicator. While the turn is active, a Braille cursor follows the stacked icons or the latest reply text. It appears on its own before the first output and disappears at turn end.