---
data:
  priority: normal
  status: done
  type: feature
id: 89bkz
title: Choose Auto Mode or Full Access per workspace
---
The composer sets Auto Mode or Full Access for each workspace. Delegated agents inherit the mode across providers. The detached host checks the provider's effective mode before it sends the prompt and declines interactive tool approvals. Both pinned wrappers completed a live Auto Mode turn and answered a task question across reconnect in Full Access. Session tests cover the mode on resume and a provider that cannot apply it.