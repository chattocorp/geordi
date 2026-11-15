---
data:
  priority: normal
  status: done
  tags:
    - agents
    - ui
  type: feature
id: zq8v2
title: Steering, sidebar toggles, generated titles and other workspace polish
---
Enter steers a working agent, Cmd/Ctrl+Enter queues. Cmd/Ctrl+B and Cmd/Ctrl+Alt+B toggle the sidebars; the left one is resizable. Braille spinner for busy agents, a new mark, the workspace ID in the header, a full-width conversation. Workspaces are named by a small model on OpenRouter through the Pi SDK. Changes and the pull request are pushed with the workspace instead of queried. Agents can archive the agents they started.

Outcome: implemented; steering, queueing and titles run end to end with a real agent.