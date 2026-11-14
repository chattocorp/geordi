# Geordi

Self-hostable code forge and agent orchestrator. See `README.md` for an overview.

## Repository layout

pnpm monorepo:

- `apps/web`: the forge (SvelteKit). Repositories, forge features, and the event log.
- `apps/daemon`: the agent daemon. Worktrees and agent processes; connects to the forge.
- `packages/protocol`: message types shared by forge and daemon.
- `planning/`: the backlog (means collection).
- `docs/adr/`, `docs/fdr/`: architecture and feature decision records.

## Before you start

- **Backlog:** list and read relevant items in `planning/` and track progress there. Use the
  `planning` MCP server when available (call `info` for schema and workflow); otherwise
  `means info --path ./planning`.
- **Decisions:** read `docs/adr/INDEX.md` and `docs/fdr/INDEX.md`. Record new architectural
  decisions with the `adr` skill and feature designs with the `fdr` skill.

## Commands

Run from the repository root:

- `pnpm dev`: start all apps
- `pnpm check`: type-check all packages
- `pnpm lint` / `pnpm format`
- `pnpm test`: run all tests
- `pnpm --filter @geordi/web <script>`: run a script in one package

Before finishing a task: `pnpm check && pnpm lint && pnpm test`.

## Architecture

- **Event sourcing (ADR-001).** All state is event-sourced. Core: `apps/web/src/lib/server/events/`.
  - The only write is `store().append(...)`. Never write state elsewhere; no transactions.
  - Each domain (e.g. `apps/web/src/lib/server/issues.ts`) defines its event union (added to
    `GeordiEvent`), an in-memory projection via `store.project(...)`, and command functions
    that check the projection, then append. Keep check-then-append synchronous: no `await`
    in between.
  - Domains are factories (`createIssues(store)`) so tests can use `new EventStore(':memory:')`.
  - Record `actor` on events; authentication comes later.
- **Forge and daemon (ADR-002).** The daemon connects to the forge over one WebSocket carrying
  JSON (`packages/protocol`): commands down, session events up. The forge stores all session
  history; the daemon holds nothing but running processes.
  - Forge: `daemons.ts` (WebSocket server) and `sessions.ts` (domain) in
    `apps/web/src/lib/server/`, wired together in `app.ts`.
  - Daemon: one adapter per agent CLI in `apps/daemon/src/agents/` maps the CLI's JSON output
    to `SessionEvent`s. `turn.ts` runs one CLI invocation per turn and guarantees exactly one
    terminal event. Follow-up turns resume the CLI's own session (`resumeId`).
  - Adding an agent: add it to `AGENTS` in the protocol, write an adapter, register it in
    `adapterFor`, and add parser tests based on real captured CLI output.

## Conventions

- **TypeScript without a build step.** The daemon and packages run on Node's type stripping:
  use erasable syntax only (no enums, namespaces, parameter properties) and include `.ts` in
  relative imports.
- **Web app:** Svelte 5 runes and SvelteKit remote functions (`*.remote.ts`), with `query.live`
  for live UI: `query.live(async function* () { yield* store().live(() => ...) })`.
  - Server-only code lives in `src/lib/server/`; import it as `#lib/server/<file>.ts`.
  - Env vars are declared in `src/env.ts` and imported from `$app/env/private` (SvelteKit 3;
    `$env/*` is deprecated).
- Shared tool versions live in the pnpm catalog (`pnpm-workspace.yaml`); reference them as
  `"catalog:"`.
- Conventional commits; mention planning item IDs and ADRs where relevant.
