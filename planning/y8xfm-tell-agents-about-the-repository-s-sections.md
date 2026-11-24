---
data:
  priority: normal
  status: todo
  type: feature
id: y8xfm
title: Tell agents about the repository's sections
---
A repository's `.geordi.yml` names its parts (`sections`: path, title, picture; `wy0wt`, FDR-006). Only the Changes tab uses them so far. Give them to agents as context, so they know the repository's layout and the names people use for its parts ("this change touches Forge and Daemon"), for example in the instructions every turn gets (`instructions.ts`) or in `workspace_status`.