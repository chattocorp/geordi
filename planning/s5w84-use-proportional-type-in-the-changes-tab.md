---
data:
  priority: normal
  status: done
  type: task
id: s5w84
title: Use proportional type in the Changes tab
---
The list and tree use IBM Plex Sans at the standard 15px list size. Paths fit the available width using the rendered font metrics. Verified the computed size in both views in Chromium at a narrow pane width. Combined directory labels now share the flat list’s path renderer. The narrow tree story checks that the outer folders shorten while the final folder name stays visible.
The final folder name uses the same muted color as the rest of the directory row. The tree story checks its computed color.
