---
data:
  priority: normal
  status: done
  type: feature
id: 4qqz2
title: Clean up merged local branches on archive and continue
---
Archive and Continue remove a local branch after confirming that its tip has merged. Archive saves the commit for Restore. Git tests cover renamed branches, retries, unmerged work, and extra commits after a squash merge. The repository checks, tests, lint and release checks passed.