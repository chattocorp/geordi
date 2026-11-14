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
  - Forge: `daemons.ts` (WebSocket server) and `workspaces.ts` (domain) in
    `apps/web/src/lib/server/`, wired together in `app.ts`.
  - A **workspace** (FDR-001) is a worktree on its own branch plus the agent sessions working
    in it. The daemon derives the worktree from the workspace ID (`worktree.ts`).
  - The daemon runs git in agent-writable worktrees: always through `gitIn`, which never
    trusts the worktree's own Git metadata.
  - Daemon: one adapter per agent CLI in `apps/daemon/src/agents/` maps the CLI's JSON output
    to `SessionEvent`s. `turn.ts` runs one CLI invocation per turn and guarantees exactly one
    terminal event. Follow-up turns resume the CLI's own session (`resumeId`).
  - Adding an agent: add it to `AGENTS` in the protocol, write an adapter, register it in
    `adapterFor`, and add parser tests based on real captured CLI output.
- **Agent API (ADR-004, FDR-002).** Agents start and supervise other agents through an MCP
  server on the forge (`mcp.ts`, served at `/mcp`). The forge issues a token per turn; the
  daemon hands URL and token to the CLI. The calling session is the parent of what it starts
  and the `actor` of the events. The operations live in `workspaces().agents`; add a tool by
  adding an entry to `tools` in `mcp.ts`.
- **Live channels (ADR-003).** Data that is derived or ephemeral is not event-sourced: the
  forge asks the daemon for a workspace's changes and diffs (`hub().request(...)`), and
  terminal I/O is relayed with an in-memory scrollback (`terminals.ts`; browsers read it as
  server-sent events, since `query.live` drops intermediate values).

## Conventions

- **TypeScript without a build step.** The daemon and packages run on Node's type stripping:
  use erasable syntax only (no enums, namespaces, parameter properties) and include `.ts` in
  relative imports.
- **Web app:** Svelte 5 runes and SvelteKit remote functions (`*.remote.ts`), with `query.live`
  for live UI: `query.live(async function* () { yield* store().live(() => ...) })`.
  - Server-only code lives in `src/lib/server/`; import it as `#lib/server/<file>.ts`.
  - Env vars are declared in `src/env.ts` and imported from `$app/env/private` (SvelteKit 3;
    `$env/*` is deprecated).
- **UI design:** colours are semantic tokens defined in `apps/web/src/routes/layout.css`
  (`bg`, `sidebar`, `surface`, `sunken`, `bubble`, `ink`, `muted`, `line`, `accent`,
  `accent-soft`, `accent-ink`, `on-accent`, `danger`, `ok`, plus `claude`/`codex` for agent
  colours), switching for light and dark mode. Dark mode is deliberately mid-tone, not
  near-black. Use tokens instead of raw Tailwind colours. Gold `accent` is for primary actions
  and things that are live; the `.visor` sweep is the only ambient motion. Surfaces use
  `shadow-soft`/`shadow-float` with a `ring-line/60` rather than hard borders. Icons: Iconify
  via `icon-[lucide--name]`. Fonts: Geist and Geist Mono from Fontsource (no remote loading);
  mono only for actual code (paths, branches, commands, output).
- **Workspace UI:** components in `#lib/components/workspace/`. Windows are tabs in a tree of
  splits (`#lib/layout.ts`, pure functions; rendered by `Panes.svelte`), named after what
  they show (`session:<id>`, `diff:<path>`, `new`). Layout and pane sizes are per-browser
  preferences (`persisted`), not events.
- **Agent output** is rendered as Markdown with `markdown-it` (raw HTML disabled), via
  `#lib/components/Markdown.svelte`.
- Shared tool versions live in the pnpm catalog (`pnpm-workspace.yaml`); reference them as
  `"catalog:"`.
- Conventional commits; mention planning item IDs and ADRs where relevant.
