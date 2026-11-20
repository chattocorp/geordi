---
data:
  priority: normal
  status: done
  type: task
id: 17f3v
title: Remove overview pages and simplify sidebar navigation
---
Remove the repository issue and pull request pages (h5hb5) and the global Overview. Fold a repository from its name or icon. Place Archive above Settings.

Removed both overview routes and their listing code. Verified the removed URLs return 404 and the repository name folds and expands its workspace list in Chromium.