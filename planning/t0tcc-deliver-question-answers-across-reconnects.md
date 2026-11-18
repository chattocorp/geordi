---
data:
  priority: high
  status: done
  type: bug
id: t0tcc
title: Deliver question answers across reconnects
---
Record answers before dispatch, acknowledge them by question ID at the host, and close withdrawn requests. Keep Codex async questions answerable while the workspace runs. Verify restart, replay and race behavior.

The forge persists each submission and retries it by question ID until the host confirms acceptance or the request closes. The conversation shows pending and unconfirmed delivery. Restart tests reopen the forge database and reattach the daemon to a detached ACP host. Additional tests cover duplicate answers, legacy replay, withdrawn forms, and blocking and async questions.