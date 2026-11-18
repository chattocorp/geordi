---
data:
  priority: normal
  status: in_progress
  tags:
    - agents
  type: task
id: fnzhw
title: Verify ACP agent sessions with live wrappers
---
Build on prototype dgzn6. Run both pinned wrappers against an isolated shell task. Verify mid-turn steering and a reply after background completion. Then connect the session host and test daemon and forge restart with exactly-once delivery.

First iteration: pnpm --filter @geordi/daemon acp:probe <codex|claude> [inspect|steer|background] uses ACP v1 in a temporary workspace. Codex 2.7.0 steered a running shell task and returned both its output and the new message. Claude 0.107.3 reported injection, but its turn returned before the task finished. Claude delivered a background result after the prompt returned. Codex started the background task and ended the foreground turn, but the expected reply did not arrive within the two-minute probe. These are observations on this machine. Verify delivery through the detached host before changing the production runner.