---
data:
  priority: normal
  status: canceled
  tags:
    - agents
    - deferred
  type: feature
id: gcyt0
title: Workspaces spanning several repositories
---
A workspace as a directory holding one worktree per repository. Touches the changes pane (per repository), sandbox roots and the terminal directory. Open question in FDR-002; do after the agent API and the sidebar tree.

## Canceled (2026-11-23)

Scrapped. A workspace stays one worktree in one repository. Work across repositories is done by agents starting children in other repositories (FDR-002), which also fits runner daemons on several machines (ADR-013).