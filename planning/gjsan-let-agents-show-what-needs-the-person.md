---
data:
  priority: normal
  status: todo
  tags:
    - agents
    - deferred
  type: feature
id: gjsan
title: Let agents show what needs the person
---
An orchestrating agent often needs the person to do something outside Geordi: approve a GitHub deployment, change a setting on npmjs.com. Today that is a sentence somewhere in a long reply, easy to miss.

Idea: an agent tool that puts a "needs you" item, with its link, on the workspace. GitHub deployment approvals waiting on a branch's runs could appear there by themselves.

This is new UI and must stay calm (CLAUDE.md invariants). Write an FDR before building it.

Source: feedback from an orchestrating agent, 2026-11-21.