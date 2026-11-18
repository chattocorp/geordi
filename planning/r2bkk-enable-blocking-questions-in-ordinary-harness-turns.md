---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: feature
id: r2bkk
title: Enable blocking questions in ordinary harness turns
---
Enabled the Codex blocking question tool in default mode and guided both harnesses to use a form when a decision blocks progress. Both pinned wrappers returned a selected answer in the same turn. A live Codex question stayed open across an isolated forge and daemon restart and accepted the answer through the workspace UI.