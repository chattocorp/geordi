---
data:
  priority: high
  status: todo
  tags:
    - agents
  type: feature
id: 0x0re
title: 'Agent API: agents start and supervise agents'
---
FDR-002, ADR-004. MCP server on the forge with per-turn session tokens; tools to start a child (same workspace or sub-workspace branched from the parent), message it, wait for it, read its reply and stop it. Record parentage; enforce depth and concurrency limits.

Acceptance: a Claude or Codex session can start a child in either mode, wait for it and read its result; children appear under their parent.