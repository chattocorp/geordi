---
data:
  priority: high
  status: done
  tags:
    - agents
    - ui
  type: feature
id: dapx6
title: Workspace actions, one conversation per workspace, message queue, archiving
---
FDR-003 and the reworked FDR-001. A workspace is one conversation; messages queue while the agent works; the top bar offers the next step (create/update PR, fix errors, address review, merge, archive) as messages to the agent; workspaces can be archived (covers 7ncxh). Agents run without permission prompts by default.

Outcome: implemented and run end to end with Claude and Codex on a scratch repository (action to commit, queued message, archive). The pull-request actions are covered by tests of the rules only: no real pull request was created or merged.