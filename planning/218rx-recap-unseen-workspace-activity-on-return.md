---
data:
  priority: normal
  status: done
  type: feature
id: 218rx
title: Recap unseen workspace activity on return
---
After five minutes away, a temporary ACP session fork summarizes the unseen work if a turn ended or a new question arrived. Each browser remembers what it saw and can turn recaps off in General settings. The installation records token usage separately for Claude and Codex. Live probes verified fork isolation and usage with both providers. Browser and unit tests cover the return threshold, cached recaps and settings. The activity excerpt keeps the end of the final reply so a closing decision reaches the recap.