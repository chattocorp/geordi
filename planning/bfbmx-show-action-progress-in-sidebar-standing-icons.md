---
data:
  priority: normal
  status: done
  type: bug
id: bfbmx
title: Show action progress in sidebar standing icons
---
The sidebar replaces the standing icon and action pill with a spinner during a pull request action. A confirmed merge stays busy while the live view still offers Merge for that pull request. Browser and command tests cover the spinner, duplicate clicks, and retry after failure.