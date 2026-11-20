---
data:
  priority: normal
  status: done
  tags:
    - agents
  type: task
id: fnzhw
title: Verify ACP agent sessions with live wrappers
---
Build on prototype dgzn6. Run both pinned wrappers against an isolated shell task. Verify mid-turn steering and a reply after background completion. Then connect the session host and test daemon and forge restart with exactly-once delivery.

First iteration: pnpm --filter @geordi/daemon acp:probe <codex|claude> [inspect|steer|background] uses ACP v1 in a temporary workspace. Codex 2.7.0 steered a running shell task and returned both its output and the new message. Claude 0.107.3 reported injection, but its turn returned before the task finished. Claude delivered a background result after the prompt returned. Codex started the background task and ended the foreground turn, but the expected reply did not arrive within the two-minute probe. These are observations on this machine. Verify delivery through the detached host before changing the production runner.

Integrated both wrappers with the detached desktop host through ACP v2. In an isolated production desktop instance, Codex accepted a steer across a daemon restart and returned the foreground command result once. Claude returned from the initial turn, then delivered its background command result once after a full forge and daemon restart. The test used the normal workspace composer and independent command output on disk.

The checked-in probe now runs the production detached ACP v2 host. Both pinned providers passed inspect, foreground steering across reconnect, and answering an open question across reconnect. Retrying the question ID produced one copy of the custom answer in the original completed turn. Claude also delivered its background result in a second turn. Codex reported tool activity after foreground completion, but did not complete a second turn within two minutes. See the live ACP session checks in README.md.

The live inspect probe also covers the installed OpenCode CLI through its native ACP v1 connection. OpenCode 1.19.6 completed a prompt through the detached host. A workspace created in the browser ran a shell command and completed its queued follow-up after restarting both services. Verified that the workspace picker lists the models from `opencode models` and can switch between a specific model and the CLI default. The picker uses each OpenCode model’s reported variants for effort. The session host applies the chosen level through ACP after selecting the model. The composer shows defaults reported by the workspace’s own ACP session.
