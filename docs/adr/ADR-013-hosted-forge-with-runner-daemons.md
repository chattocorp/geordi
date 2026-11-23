# ADR-013: A hosted forge with runner daemons

**Date:** 2026-11-23

**Status:** Proposed. To be taken up after 0.8; nothing here is built yet.

## Context

Geordi is today an agent orchestrator that runs on one machine: the desktop app (ADR-008) or `npx geordi` starts a forge and one daemon side by side, and both see the same disk. Its long-term purpose is the one in its name: a self-hostable code forge. Someone deploys Geordi on a server that holds Git repositories, and Geordi is the UI for them, with issues and pull requests, and with agents doing work in them. The desktop app came out of building Geordi with Geordi.

We also want work spread over several machines: the laptop, and machines that are always on, such as a VPN-only server (`satellite-01`).

We considered:

- **One Geordi per machine, federated.** Each machine runs a whole forge, and the desktop app shows several. Each machine keeps its own history and works without the others, and cross-machine orchestration mostly exists already (ADR-004's named tokens). But a forge is one place that everyone looks at: federation splits its history and solves a problem a hosted forge does not have.
- **One forge, many daemons.** The forge holds the repositories, the history and the UI, and daemons on any machine run the work. This is the CI-runner model ADR-002 already chose for the connection.

## Decision

- **Geordi is a forge on a server, with daemons as runners.** The forge owns repositories, the event log and the UI. Daemons own worktrees and agent processes on their machines and dial in to the forge (ADR-002), so no runner has to be reachable.
- **The forge hosts the repositories.** Daemons clone from it and push to it. An upstream such as GitHub becomes a mirror or an import (ADR-006 stays the adapter for it).
- **Several daemons are connected at once.** Each workspace records the daemon it runs on, and the forge sends what concerns a workspace to that daemon. Placement follows one fixed rule, decided when it is built (for example: the person's own daemon if it is connected, otherwise a shared one).
- **Repositories are identified by their ID, not by a path.** Each daemon finds its own clone of a repository from the ID.
- **People log in.** Events name a person as `actor`, as ADR-001 intended. Daemons get credentials of their own (planning `2395q`).
- **The desktop app is a client.** It shows a forge at an address and runs a local daemon that dials in. Today's all-in-one app is the case where that forge runs on the same machine, started the same way (ADR-008).

## Consequences

- What carries over unchanged: event sourcing (ADR-001), the protocol and the direction of the connection (ADR-002), agents that survive forge restarts and acknowledged cursors (ADR-003, ADR-010), live data requested over the daemon socket, views over one browser WebSocket (ADR-009), and the MCP agent API (ADR-004), which only has to be reached at the forge's real address.
- What has to be reworked:
  - The daemon hub (`daemons.ts`) keeps one active daemon and records one owner (`daemon.selected`). It will hold several connections and route by workspace.
  - Repositories are registered by local path (`repos.ts`), and many protocol messages carry `repoPath`. Both move to repository IDs; events recorded with paths are translated on replay (`legacy.ts`).
  - Task URLs (FDR-006) point at `localhost`. For a workspace on another machine, they need that machine's host name, or a proxy through the forge.
- What has to be built: authentication for people and daemons, Git hosting over HTTP or SSH, and the desktop app connecting to a forge at an address.
- Still to decide: personal runners (a laptop that runs only its owner's work, with its owner's agent logins) against shared ones (a server running anyone's work), and what agents on a shared runner are logged in as.
- Until then, new work should not tie repositories more closely to local paths. Projects (FDR-012), the most single-machine part of Geordi, are removed first (planning `nzqqn`).
- A first step that is useful alone: several daemons and placement, with each daemon cloning from GitHub. That lets an always-on server run agents for a local forge before Geordi hosts any repositories.
