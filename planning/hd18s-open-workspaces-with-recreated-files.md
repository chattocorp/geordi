---
data:
  priority: high
  status: done
  type: bug
id: hd18s
title: Open workspaces with recreated files
---
Reproduced a duplicate path in the Changes pane when a staged deletion had an untracked replacement. The daemon now compares the replacement with the base in a temporary index. A Git regression test covers modified and identical replacements. Verified list and tree views with the affected workspace and its corrected 17-file comparison.