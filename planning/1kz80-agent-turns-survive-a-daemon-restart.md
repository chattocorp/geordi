---
data:
  priority: normal
  status: done
  tags:
    - agents
    - daemon
  type: feature
id: 1kz80
title: Agent turns survive a daemon restart
---
Agent CLIs run detached from the daemon and are followed through files (ADR-007). A restarted daemon picks running turns up again; Ctrl+C still stops them.

Follow-up: terminals still die with the daemon.