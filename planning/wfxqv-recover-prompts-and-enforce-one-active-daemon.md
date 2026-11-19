---
data:
  priority: high
  status: done
  type: bug
id: wfxqv
title: Recover prompts and enforce one active daemon
---
Persist every prompt before dispatch and retry until the host receives it. Restore detached sessions on Windows. Admit one daemon so another inventory cannot mark active turns lost.

Verified by reopening the forge database, retrying the first prompt against a detached host, and connecting competing authenticated daemons. Native Windows CI covered reattachment and PID reuse. In a separate macOS run, both services restarted during a turn and recovered one prompt receipt and one reply from the same host.