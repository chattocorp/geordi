---
data:
  priority: normal
  status: done
  type: bug
id: 015y1
title: Keep the last terminal row visible
---
Fit the terminal grid inside the padded pane on open and resize.

The terminal now measures its content box. A Chromium story checks the lower edge of the grid on open and after the pane shrinks.
