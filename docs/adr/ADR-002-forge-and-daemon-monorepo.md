# ADR-002: Forge and agent daemon in a TypeScript monorepo

**Date:** 2026-11-14

## Context

Geordi runs coding agents (`claude -p`, `codex`) in Git worktrees. Agent processes are long-running and must not die when the web app restarts or reloads during development. The work happens on whichever machine holds the code, and eventually we want agents running on several machines (laptop, home server, cloud dev box) managed from one forge.

Apps like Paseo and T3 Code split logic into a daemon with a separate frontend. We considered:

- **Everything in the SvelteKit app**: simplest, but agent lifetime is tied to the web server.
- **A Go daemon owning everything** (repos, forge, agents) with the UI as a client: strong process management and single-binary distribution, but two languages, a code-generated API boundary, and most feature work would move out of SvelteKit.
- **A Go daemon for agents only**: better scope, but still two languages for a small, stable component.

## Decision

- Split Geordi into a **forge** and an **agent daemon**, modelled on CI runners.
  - The **forge** (`apps/web`, SvelteKit) owns repositories, forge features, and the event log (ADR-001), including all agent session history.
  - The **daemon** (`apps/daemon`) owns worktrees and agent processes on its machine. It streams session events to the forge and keeps only a short buffer for resending after a reconnect.
- The daemon connects **to** the forge (like GitHub Actions runners) over a single WebSocket carrying JSON messages: commands flow down, events flow up. This works behind NAT without opening ports on agent machines.
- Message types live in a shared package (`packages/protocol`).
- Everything is **TypeScript** in a **pnpm monorepo** (`apps/*`, `packages/*`). Node runs the daemon and shared packages directly from `.ts` sources via type stripping; there is no build step outside the web app. Bun may later compile the daemon into a single binary.

## Consequences

- Agent sessions survive forge restarts; one forge can drive daemons on several machines.
- One language and shared types across the boundary, with no code generation.
- Type stripping means erasable TypeScript syntax only (no enums, namespaces, or parameter properties).
- We must design a reconnect-safe protocol and keep the daemon's buffer and the forge's log consistent.
- For now, forge and daemon run on the same machine and share repository paths. Running daemons elsewhere will require the forge to host repositories that daemons clone and push to.
