---
data:
  priority: normal
  status: done
  type: bug
id: 43f65
title: Compare workspace changes with the merge target
---
Changes names the comparison branch and uses its merge base for the file list, counts, diffs and release notes. A known pull request sets the target. Children inherit their parent’s target when its work is already there. Verified with real Git histories and by reopening the signing example after restarting an isolated forge. It showed eight files against main and opened the signing script diff.