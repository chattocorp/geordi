---
data:
  priority: normal
  status: done
  type: feature
id: v4nm7
title: Steer messages within a delegation
---
Delegated messages and child reports steer the current turn. Senders can queue a follow-up with `interrupt: false`. Tests cover waiting parents, external clients, and queued OpenCode reports after a forge restart (FDR-002).