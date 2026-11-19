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
- Tokens are valid only while their turn runs. They are derived (signed with a key in the forge's data directory) rather than stored, so a running agent keeps its access when the forge restarts (ADR-003).
- **Reading is open, supervising follows parentage.** Any caller can list, read, check and wait on any workspace, in any repository. Messaging, interrupting, stopping and archiving a workspace's agent are for whoever started it, directly or not. An agent that a malicious repository has turned can thus look around, but can't set other repositories' agents (which run without permission prompts) to work.
- **External clients** (an agent outside Geordi) authenticate with a named bearer token, issued and revoked in Settings, for the repositories the person chose: never those added later. For such a client, the workspaces of other repositories don't exist. Nor for the agents it starts (directly or not), which would otherwise be its way around that; and a removed repository is dropped from every grant, as its ID may be used again. The forge stores a digest of it and records grants and revocations in its event log; the grant is the `actor` of what the client does. A client can start agents in its repositories (`repository`), and supervises those as a workspace supervises its children. As a person granted it on purpose, it may also message any agent, but it interrupts only its own: a person's agent is not turned around in the middle of its work. It can't use the tools about a workspace of one's own (naming it, its configuration) or answer an agent's questions, which are for the person.
- Tools let an agent start a child, send it a message, wait until it is idle, read its latest reply, stop it. Waiting is a first-class tool (a long poll, at most 45 seconds per call) so supervision needs no polling loops of the caller's own.
- Limits on nesting depth and on concurrently running children are enforced by the forge.

## Consequences

- Agent orchestration needs no installation step and works the same on every daemon machine.
- Parentage and attribution fall out of authentication instead of being claimed by the caller.
- The agent's machine must be able to reach the forge's HTTP port. That is given while forge and daemon share a machine; remote daemons will need the forge reachable over TLS, like the WebSocket (ADR-002).
- Agents without MCP support can't use the API. A thin CLI over the same endpoints can be added later if needed.
- The forge gains an authenticated HTTP surface before it has user authentication; it must accept nothing but valid agent credentials there.
