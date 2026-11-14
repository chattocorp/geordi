---
data:
  priority: low
  status: done
  tags:
    - agents
    - ui
  type: feature
id: 1d61j
title: Render agent output as Markdown
---
Agent messages are shown as plain pre-wrapped text. Render Markdown (sanitised), and show tool calls more compactly.

## Outcome

Agent messages render as Markdown via markdown-it (raw HTML disabled, unsafe link protocols rejected), styled with the typography plugin in both themes. Tool calls are single expandable lines with an icon per tool and paths relative to the worktree.
