# ADR-004: An agent API over MCP, served by the forge

**Date:** 2026-11-14

## Context

Agents should be able to start and supervise other agents (FDR-002). For that, an agent running in a workspace needs a way to call Geordi, and Geordi needs to know which agent is calling so it can record who controls what.

We considered:

- **Skills and a CLI installed into the user's system** (as Paseo does): agents shell out to a `geordi` command. Works with any agent, but writes into the user's global agent configuration, has to be kept in sync on every daemon machine, and needs its own way to identify the caller.
- **An MCP server run by the daemon** next to each agent process, relaying over the daemon's WebSocket: no network path from agent to forge needed, but a second process per turn and a second protocol hop to maintain.
- **An MCP server on the forge**, handed to the agent for the duration of a turn.

## Decision

- The forge serves Geordi's agent API as an **MCP server over HTTP**. Both supported CLIs accept MCP servers per invocation (`claude --mcp-config`, `codex -c mcp_servers.…`), so nothing is installed or changed on the user's system.
- With every turn, the forge issues a **token scoped to that session**, and the daemon passes server URL and token to the CLI. The forge resolves the token to the calling session; that session is the `actor` of every event the call causes, and the parent of anything it starts.
- Tokens are valid only while their turn runs. They are derived (signed with a key in the forge's data directory) rather than stored, so a running agent keeps its access when the forge restarts (ADR-003). An agent can only act on the sessions and workspaces it started itself (its descendants).
- The API is a small set of tools: start a child, send it a message, wait until it is idle, read its latest reply, stop it. Waiting is a first-class tool so supervision needs no polling loops.
- Limits on nesting depth and on concurrently running children are enforced by the forge.

## Consequences

- Agent orchestration needs no installation step and works the same on every daemon machine.
- Parentage and attribution fall out of authentication instead of being claimed by the caller.
- The agent's machine must be able to reach the forge's HTTP port. That is given while forge and daemon share a machine; remote daemons will need the forge reachable over TLS, like the WebSocket (ADR-002).
- Agents without MCP support can't use the API. A thin CLI over the same endpoints can be added later if needed.
- The forge gains an authenticated HTTP surface before it has user authentication; it must accept nothing but valid session tokens there.
