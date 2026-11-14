---
data:
  priority: normal
  status: todo
  tags:
    - agents
  type: feature
id: n02ab
title: Run agents by wrapping claude -p and codex
---
Spawn `claude -p --output-format stream-json` (and later `codex`) as subprocesses, persist their events, and stream progress to the UI.

Note: `query.live` keeps only the latest value; stream current state or a tail, or add a dedicated SSE endpoint for a full event stream.