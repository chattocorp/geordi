---
data:
  priority: high
  status: in_progress
  type: bug
id: wfxqv
title: Recover prompts and enforce one active daemon
---
Persist every prompt before dispatch and retry until the host receives it. Restore detached sessions on Windows. Admit one daemon so another inventory cannot mark active turns lost.