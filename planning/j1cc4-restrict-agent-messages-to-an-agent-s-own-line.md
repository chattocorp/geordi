---
data:
  priority: normal
  status: done
  type: task
id: j1cc4
title: Restrict agent messages to an agent's own line
---
Repository agents could message (and so wake) any agent in an accessible repository. Now `send_message` from a repository agent reaches only its descendants and its parent. Reading and waiting stay installation-wide; external clients and projects are unchanged. Reverses the peer messaging of g5eef. Covered in `mcp.spec.ts`.