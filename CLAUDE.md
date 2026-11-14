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
- `pnpm --filter @geordi/web storybook`: the design system, on http://localhost:6006

Before finishing a task: `pnpm check && pnpm lint && pnpm test`.

## Invariants

- **Everything that runs lives in the daemon; the forge only shows it** (ADR-003). Agent
  turns, terminals and future long-running things must survive a forge restart unchanged.
  The forge may keep live state in memory only if it can rebuild it from the event log or
  from what a reconnecting daemon reports. Test new features by restarting the forge.
- **Keep the UI calm.** Four font sizes only (`text-xs` 13px, `text-sm` 15px, `text-base`
  17px, `text-2xl` for page titles; defined in `layout.css`), three radii, one accent.
  Never arbitrary sizes. Hierarchy comes from weight and colour.
- **Interactive elements have a pointer cursor.** `layout.css` gives it to links, buttons,
  tabs, summaries and labels of inputs; anything else made clickable needs `cursor-pointer`
  (or the right `role`). Never `cursor-default` on something you can click.

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
- **Upstream forges (ADR-006).** The daemon talks to the forge a repository is hosted on
  through the `forges` library (`apps/daemon/src/upstream.ts`): never a forge-specific
  client. Credentials come from `FORGES_*` variables in the daemon's environment, or the
  GitHub CLI's login. Upstream state is live data: asked on demand, cached briefly, never
  stored.
- **Agent API (ADR-004, FDR-002).** Agents start and supervise other agents through an MCP
  server on the forge (`mcp.ts`, served at `/mcp`). The forge derives a token per turn; the
  daemon hands URL and token to the CLI. The calling session is the parent of what it starts
  and the `actor` of the events. The operations live in `workspaces().agents`; add a tool by
  adding an entry to `tools` in `mcp.ts`.
- **Live channels (ADR-003).** Data that is derived or ephemeral is not event-sourced: the
  forge asks the daemon for a workspace's changes and diffs (`hub().request(...)`), and
  learns when to ask again by push, never by polling: the daemon watches the workspaces
  someone has open (`watch.ts`, `watchers.ts`) and the workspace live query carries a
  `filesRevision` that changes with them. Also,
  terminal I/O is relayed with an in-memory scrollback (`terminals.ts`; browsers read it as
  server-sent events, since `query.live` drops intermediate values). Shells and scrollback
  live in the daemon (`apps/daemon/src/terminals.ts`).

## Conventions

- **TypeScript without a build step.** The daemon and packages run on Node's type stripping:
  use erasable syntax only (no enums, namespaces, parameter properties) and include `.ts` in
  relative imports.
- **Web app:** Svelte 5 runes and SvelteKit remote functions (`*.remote.ts`), with `query.live`
  for live UI: `query.live(async function* () { yield* store().live(() => ...) })`.
  - Server-only code lives in `src/lib/server/`; import it as `#lib/server/<file>.ts`.
  - Env vars are declared in `src/env.ts` and imported from `$app/env/private` (SvelteKit 3;
    `$env/*` is deprecated).
- **Design system (ADR-005).** Three layers; use them in this order before writing raw
  Tailwind:
  - **Tokens** in `apps/web/src/routes/layout.css`: semantic colours (`bg`, `sidebar`,
    `surface`, `sunken`, `bubble`, `ink`, `muted`, `line`, `accent`, `accent-soft`,
    `accent-ink`, `on-accent`, `danger`, `ok`, plus `claude`/`codex`) for light and dark
    mode, four font sizes, and the radii `rounded-card`, `rounded-control`, `rounded-full`.
  - **Utilities** (`@utility` in the same file): `card`, `card-float`, `card-link`, `input`,
    `pane-bar`, `scroller`, `page`, `title`, `heading`, `label`, `code`, `code-dense`, `item`,
    `item-active`, `empty`, `dot`, `dot-live`.
  - **Components** in `#lib/ui/` (`Button`, `Badge`, `Composer`, `Notice`, `Page`, `Panes`,
    `Split`, `ThemeToggle`): generic, no domain knowledge. Domain components live in
    `#lib/components/`.
  - Raw Tailwind is for layout (flex, grid, spacing). A visual pattern used twice becomes a
    utility (styling only) or a component (behaviour or structure). Never use arbitrary
    values or raw colours.
  - Every `lib/ui` component has a `*.stories.svelte` next to it (Svelte CSF; use
    `<Story name="…" asChild>` to render your own markup). `pnpm test` renders every story
    in a browser. Add or update stories with every UI change.
- **Look and feel:** dark mode is deliberately mid-tone, not near-black. Gold `accent` is for
  the primary action and things that are live; the `.visor` sweep is the only ambient
  motion. Surfaces use shadows with a faint ring rather than hard borders. Icons: Iconify via
  `icon-[lucide--name]`. Fonts: IBM Plex Sans and IBM Plex Mono from Fontsource (no remote
  loading); mono only for actual code (paths, branches, commands, output).
- **Workspace UI:** components in `#lib/components/workspace/`. Windows are tabs in a tree of
  splits (`#lib/layout.ts`, pure functions; rendered by `Panes.svelte`), named after what
  they show (`session:<id>`, `diff:<path>`, `new`). Layout and pane sizes are per-browser
  preferences (`persisted`), not events.
- **Diffs** are rendered by `#lib/components/DiffView.svelte` with `@pierre/diffs`
  (https://diffs.com) from both whole file versions, which is what makes context
  expandable. It renders into a shadow root; style it through its `--diffs-*` properties.
- **Agent output** is rendered as Markdown with `markdown-it` (raw HTML disabled), via
  `#lib/components/Markdown.svelte`.
- Shared tool versions live in the pnpm catalog (`pnpm-workspace.yaml`); reference them as
  `"catalog:"`.
- Conventional commits; mention planning item IDs and ADRs where relevant.
