---
data:
  priority: normal
  status: todo
  tags:
    - deferred
  type: feature
id: 14rk7
title: Group tasks in the Tasks tab
---
Long task lists (twenty-odd playtest/sortie tasks in one repository) are hard to scan in the Tasks tab.

Idea: a `group:` per task in `.geordi.yml` (FDR-006). Ungrouped tasks (defaults first) come first, then each group in file order as a collapsible section whose header says whether anything in it runs; folded state remembered per browser. Open question: start groups folded?

Raised 2026-11-23 alongside the Tasks toolbar (run default / stop all); deferred by the user.