---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: feature
id: c447d
title: Installation-wide MCP access to workspaces
---
Let workspace agents and named external clients find and read workspaces across all repositories, and let external clients start and supervise agents of their own.

Outcome (ADR-004, FDR-002):

- Reading (list, read, status, wait) is open to every caller, in every repository.
- Supervising (message, interrupt, stop, archive) follows parentage: workspace agents message only their descendants, so a compromised agent can't set other repositories' agents to work.
- External clients authenticate with a named token from Settings, start agents in a `repository` (`startedBy`), and supervise those. They may message any agent, but interrupt only their own. They can't answer questions or use the tools about a workspace of one's own.