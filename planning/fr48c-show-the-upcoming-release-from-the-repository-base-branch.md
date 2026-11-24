---
data:
  priority: normal
  status: done
  type: feature
id: fr48c
title: Show the upcoming release from the repository base branch
---
Show a repository version pill for a pending release. Open a read-only release plan grouped by package and note type, accessible from the repository menu even with no pending release. Use the repository base commit and its release tool.

Implemented and verified the sidebar link, empty menu state, live Sweet Release preview, and recovery after a forge restart. The Changesets regression covers a divergent checkout and packages released together.