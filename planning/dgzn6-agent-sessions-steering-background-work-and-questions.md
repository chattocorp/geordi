---
data:
  priority: high
  status: done
  tags:
    - agents
    - daemon
  type: feature
id: dgzn6
title: 'Agent sessions: steering, background work and questions'
---
Run each agent's CLI as a long-lived session instead of once per turn (ADR-010), so that a message can steer a running turn, an agent can pick up again when background work ends, and it can ask the person a question.

## Outcome

- Daemon: `host.ts` (one host process per session, speaking the CLI's protocol) and `session.ts` (the daemon's side, through files; ADR-007 holds). Adapters are `Dialogue`s: Claude over `stream-json` with control requests, Codex over `app-server`.
- Forge: turns are the agent's to begin and end (`turn.started`), no turn numbers; steering is a plain message; `question` / `workspace.answered`; `asking` in the sidebar, ribbon and notifications.
- Verified against real Claude and Codex in a second instance: steering mid-turn, stop and carry on in the same CLI, a background task waking the agent across a daemon restart, a question answered in the UI, forge restart, resume after the idle exit.

## Not done

- Permission prompts other than questions are still refused (Claude) or accepted (Codex), as before.
- Codex approval requests and MCP elicitations are answered from the schema's shape only; none could be provoked.
- The desktop build's host (`daemon/host.js`, run with `ELECTRON_RUN_AS_NODE`) is untested until the app is installed.