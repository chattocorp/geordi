# Geordi

Self-hostable code forge and agent orchestrator. See `README.md` for an overview.

## Repository layout

pnpm monorepo:

- `apps/web`: the forge (SvelteKit). Repositories, forge features, and the event log.
- `apps/daemon`: the agent daemon. Worktrees and agent processes; connects to the forge.
- `apps/desktop`: the desktop app (Electron). Starts forge and daemon, and shows the forge.
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
- `pnpm desktop`: build the desktop app and run it from `apps/desktop/stage`
- `pnpm desktop:install`: build it, replace `/Applications/Geordi.app` and open it

Before finishing a task: `pnpm check && pnpm lint && pnpm test && sweet doctor`.

## Invariants

- **Everything that runs lives in the daemon; the forge only shows it** (ADR-003). Agent
  turns, terminals and future long-running things must survive a forge restart unchanged.
  The forge may keep live state in memory only if it can rebuild it from the event log or
  from what a reconnecting daemon reports. Test new features by restarting the forge.
- **Geordi is opinionated.** One good, fixed way of doing something beats a configurable
  one. Don't add freedom (movable panels, options, modes) unless it earns its place; when
  in doubt, decide for the user.
- **A calm, readable UI comes first.** The priority in everything people see is a calm
  interface that is easy to read, with great typography and great UX/UI. When a change
  makes the screen busier, harder to read or rougher to use, it is the wrong change, however
  useful what it adds; find the quiet way to do it, or leave it out.
- **Keep the UI calm.** Four font sizes only (`text-xs` 13px, `text-sm` 15px, `text-base`
  16px, `text-2xl` for page titles; defined in `layout.css`), three radii, one accent.
  Never arbitrary sizes. Hierarchy comes from weight and colour.
- **Interactive elements have a pointer cursor.** `layout.css` gives it to links, buttons,
  tabs, summaries and labels of inputs; anything else made clickable needs `cursor-pointer`
  (or the right `role`). Never `cursor-default` on something you can click.

## Architecture

- **Event sourcing (ADR-001).** All state is event-sourced. Core: `apps/web/src/lib/server/events/`.
  - The only write is `store().append(...)`. Never write state elsewhere; no transactions.
  - Each domain (e.g. `apps/web/src/lib/server/repos.ts`) defines its event union (added to
    `GeordiEvent`), an in-memory projection via `store.project(...)`, and command functions
    that check the projection, then append. Keep check-then-append synchronous: no `await`
    in between.
  - Domains are factories (`createRepos(store)`) so tests can use `new EventStore(':memory:')`.
  - Record `actor` on events; authentication comes later.
- **Forge and daemon (ADR-002).** The daemon connects to the forge over one WebSocket carrying
  JSON (`packages/protocol`): commands down, agent events up. The forge stores all conversation
  history; the daemon holds nothing but running processes.
  - Forge: `daemons.ts` (WebSocket server) and `workspaces.ts` (domain) in
    `apps/web/src/lib/server/`, wired together in `app.ts`.
  - A **workspace** (FDR-001) is one conversation with one agent, in a worktree on its own
    branch. There are no sessions: a second agent is a second workspace, which may work in
    another's worktree (`worktreeId`): such an agent is shown in that workspace, as a
    conversation tab (`agent:<id>`), and not in the sidebar (`withAides` in `#lib/family.ts`). The daemon derives a worktree from that ID
    (`worktree.ts`). Events from before this model are translated on replay (`legacy.ts`).
  - Turns are numbered. A daemon says which turn its events are of, and the forge drops
    what is not of the workspace's current turn: a daemon may report late, or twice.
  - A message to a working agent either steers it (`workspace.steered`: the turn is stopped
    and the message sent at once) or queues (`workspace.queued`: sent when the turn ends).
  - Workspaces get their titles from the daemon (`titles.ts`), which asks a small model on
    OpenRouter with a plain HTTP request (`OPENROUTER_API_KEY`). No SDK: prefer a few lines
    of our own over a heavy dependency.
  - **Workspace actions** (FDR-003) are derived from state by `#lib/actions.ts` (pure, and
    tested); most just `say` something to the agent.
  - Agents run without permission prompts by default (they must commit, push and use `gh`).
  - Every turn tells the agent that it works in Geordi, and how (`instructions.ts` in the
    forge; the adapters add it to the CLI's system prompt).
  - The daemon runs git in agent-writable worktrees: always through `gitIn`, which never
    trusts the worktree's own Git metadata.
  - Daemon: one adapter per agent CLI in `apps/daemon/src/agents/` maps the CLI's JSON output
    to `SessionEvent`s. `turn.ts` runs one CLI invocation per turn and guarantees exactly one
    terminal event. Turns run detached from the daemon and are
    followed through files, so they survive a daemon restart (ADR-007); only Ctrl+C stops
    them. Test changes to turns by restarting the daemon mid-turn. Follow-up turns resume the CLI's own session (`resumeId`).
  - A workspace runs with the model and effort chosen for it (FDR-004, `settings`). Each
    adapter says what its CLI offers (`offers()`); the daemon tells the forge in its `hello`.
  - Adding an agent: add it to `AGENTS` in the protocol, write an adapter, register it in
    `adapterFor`, and add parser tests based on real captured CLI output.
- **Upstream forges (ADR-006).** The daemon talks to the forge a repository is hosted on
  through the `forges` library (`apps/daemon/src/upstream.ts`): never a forge-specific
  client. Credentials come from `FORGES_*` variables in the daemon's environment, or the
  GitHub CLI's login. Upstream state is live data: asked on demand, cached briefly, never
  stored.
- **Agent API (ADR-004, FDR-002).** Agents start and supervise other agents through an MCP
  server on the forge (`mcp.ts`, served at `/mcp`). The forge derives a token per turn; the
  daemon hands URL and token to the CLI. The calling workspace is the parent of what it starts
  and the `actor` of the events. The operations live in `workspaces().agents`; add a tool by
  adding an entry to `tools` in `mcp.ts`.
- **Desktop app (ADR-008).** `apps/desktop/src/main.js` starts the forge's production build and
  the daemon as they are, on ports of its own (7717, 7718, and 7719 for browsers' WebSocket), with data in `~/.geordi`; `pnpm dev`
  keeps its data in `.data/`, so both can run at once. The app must not grow a second way of
  running anything: configure forge and daemon through their environment. The web app's
  packages are all `devDependencies`, so that its build needs nothing but Node. Its window has
  no title bar: every page starts with a `TitleBar`, which in the app (`desktop:` variant) makes
  room for the window's buttons and is what the window is dragged by (`window-drag`, on
  the bar itself; what can be used in it is exempt). The
  layout puts the sidebar toggle and back/forward into it (`setTitleBarLead`).
- **Repository configuration (FDR-006).** A repository's `.geordi.yml` (YAML; a `.geordi.toml` is still read where there is none) names jobs to run
  (with what they need), links to open, and how many ports a workspace gets. The daemon reads
  it (`config.ts`: the workspace's file, else the one on the branch work starts from) and
  reports it with the worktree's state. Each job runs in a terminal named `JOB_TERMINAL` +
  its name; the forge says which to start when (`jobs.ts`). A workspace's ports are assigned
  once and written down (`ports.ts`), and reach everything in it as `GEORDI_PORT…`. Commands
  run only as a person saw and agreed to them (`approvals.ts`). The daemon runs the `setup`
  script by itself when it makes a worktree (the first turn waits for it; `setUp` in
  `main.ts`) and `teardown` before it removes one, each in a job-like terminal it tells the
  forge of (`terminal.opened`). The settings are described
  for agents in `CONFIG_SETTINGS`; a new one goes there and into `parseConfig`.
- **Changesets (FDR-007).** In a repository that uses a release tool, a workspace shows the
  change notes it adds and the versions they lead to. One adapter per tool in the daemon
  (`releases.ts`; Sweet Release so far) says whether a repository uses it and asks the tool
  what is pending; everything else deals in packages, versions and notes (`ReleasePlan`).
  A tool is run with `gitEnv`, like our own git: never trusting the worktree's Git metadata.
- **Standings.** The sidebar shows how each workspace's work stands (its pull request, its
  checks): `standings.ts` in the forge asks a daemon about the worktrees nobody has open,
  the stalest first, and takes what open ones learn. In memory only; `standingOf` puts it
  into an icon and words.
- **Repository icons.** The sidebar shows the picture a repository has of itself (a tracked
  favicon or logo): the daemon finds it (`icon.ts`), the forge keeps it a while and serves
  it at `/repos/[id]/icon`. Live data, like everything derived: never stored.
- **What is live on a page comes over one WebSocket per window (ADR-009).** A browser has
  six connections to a server, for all its windows; a request that stays open (a live
  query, an event stream) holds one, and once they are used up no navigation and no click
  gets through, though the page looks alive. So nothing live is a request: the forge has a
  WebSocket server for browsers (`live.ts`, on `GEORDI_LIVE_PORT`), which sends **views**
  (`views.ts`: `navigation`, `workspace`, `repoWorkspaces`) and terminal output to whoever
  follows them. Pages follow with `follow()` / `followTerminal()` (`#lib/live.svelte.ts`)
  and read `.current`; never `await` data inside a component within a page. Commands and
  forms stay remote functions. Something new that is live becomes a view.
- **Live channels (ADR-003).** Data that is derived or ephemeral is not event-sourced: the
  forge asks the daemon for a workspace's changes and diffs (`hub().request(...)`), and
  learns when to ask again by push, never by polling: the daemon watches the worktrees
  someone has open (`watch.ts`), the forge then loads their state once for everyone
  (`watchers.ts`) and sends it with the workspace live query (`git`). Browsers don't query
  for it. Also,
  terminal I/O is relayed with an in-memory scrollback (`terminals.ts`; browsers follow it
  over the page's WebSocket (ADR-009), every piece of it, where a view only ever has its latest value). Shells and scrollback
  live in the daemon (`apps/daemon/src/terminals.ts`).

## Conventions

- **TypeScript without a build step.** The daemon and packages run on Node's type stripping:
  use erasable syntax only (no enums, namespaces, parameter properties) and include `.ts` in
  relative imports.
- **Web app:** Svelte 5 runes and SvelteKit remote functions (`*.remote.ts`), for what
  pages do (`command`, `form`, `query` for something asked once). What is live is a view,
  followed over the page's WebSocket (ADR-009): never `query.live`.
  - Server-only code lives in `src/lib/server/`; import it as `#lib/server/<file>.ts`.
  - Env vars are declared in `src/env.ts` and imported from `$app/env/private` (SvelteKit 3;
    `$env/*` is deprecated).
- **Design system (ADR-005).** Three layers; use them in this order before writing raw
  Tailwind:
  - **Tokens** in `apps/web/src/routes/layout.css`: semantic colours (`bg`, `sidebar`,
    `surface`, `sunken`, `bubble`, `ink`, `muted`, `line`, `accent`, `accent-soft`,
    `accent-ink`, `on-accent`, `danger`, `danger-soft`, `ok`, `on-ok`, `merged`, `on-merged`, plus `claude`/`codex`) for light and dark
    mode, four font sizes, and the radii `rounded-card`, `rounded-control`, `rounded-full`.
  - **Utilities** (`@utility` in the same file): `card`, `card-float`, `card-link`, `input`,
    `message`, `pane-bar`, `scroller`, `page`, `title`, `heading`, `label`, `code`, `code-dense`, `item`,
    `item-active`, `menu-item`, `menu-item-active`, `empty`, `dot`, `dot-live`.
  - **Components** in `#lib/ui/` (`Button`, `Badge`, `Composer`, `ContextMenu`, `Dialog`, `Notice`, `Page`, `Panes`,
    `Ring`, `Segmented`, `Select`, `Spinner`, `Split`, `TitleBar`): generic, no domain knowledge. Domain components live in
    `#lib/components/`.
  - Raw Tailwind is for layout (flex, grid, spacing). A visual pattern used twice becomes a
    utility (styling only) or a component (behaviour or structure). Never use arbitrary
    values or raw colours.
  - Context menus: `{@attach contextMenu(() => items)}` (`#lib/ui/menu.svelte.ts`) on the
    element; the layout renders the one `ContextMenu` that shows them.
  - Every `lib/ui` component has a `*.stories.svelte` next to it (Svelte CSF; use
    `<Story name="…" asChild>` to render your own markup). `pnpm test` renders every story
    in a browser. Add or update stories with every UI change.
- **Look and feel:** dark mode is deliberately mid-tone, not near-black. Gold `accent` is for
  the primary action and things that are live. The only ambient motion is for things at
  work: the `.visor` sweep and the Braille `Spinner` for agents, `bar-running` for checks still running, and `edge-live` round the reply box of an agent at work. Surfaces use shadows with a faint ring rather than hard borders. Icons: Iconify via
  `icon-[lucide--name]`. Fonts: IBM Plex Sans and JetBrains Mono from Fontsource (no remote
  loading); mono only for actual code (paths, branches, commands, output). Terminals add
  Nerd Font symbols for prompt icons (`--font-terminal`; the file is in `#lib/fonts/`).
- **Settings (FDR-005):** one dialog (`#lib/components/Settings.svelte`), opened with
  `openSettings(section?)` or Cmd/Ctrl+,. Preferences of this browser (the theme,
  `#lib/theme.svelte.ts`) live in localStorage; what belongs to the installation
  (repositories) is events.
- **Workspace UI:** components in `#lib/components/workspace/`. The frame is fixed: main
  area | changes above dock. Main area and dock are each a `Panes` with its own layout tree
  (`#lib/layout.ts`, pure functions). Windows are tabs named after what they show: `chat`
  (pinned to the main area), `diff:<path>` and `terminal:<name>`, which can be dragged
  between the two (`Panes` props `accepts`/`onreceive`, shared drag state in
  `drag.svelte.ts`). Which windows exist follows from the workspace's state; only their
  arrangement is a per-browser preference (`persisted`), not an event.
- **Diffs** are rendered by `#lib/components/DiffView.svelte` with `@pierre/diffs`
  (https://diffs.com) from both whole file versions, which is what makes context
  expandable. It renders into a shadow root; style it through its `--diffs-*` properties.
- **Agent output** is rendered as Markdown with `markdown-it` (raw HTML disabled), via
  `#lib/components/Markdown.svelte`.
- Shared tool versions live in the pnpm catalog (`pnpm-workspace.yaml`); reference them as
  `"catalog:"`.
- Conventional commits; mention planning item IDs and ADRs where relevant.

## Releases

Releases are managed with [Sweet Release](https://github.com/chattocorp/sweet-release). Geordi
is released as one package, the repository root (`.sweet.yml`); its version is kept in the
desktop and web apps' `package.json`.

- Every user-facing change needs a release note, committed with the change:
  `printf 'Describe the change.\n' | sweet change . --type <type> --stdin`
- Types are configured in `.sweet.config.yml`. Add `breaking: true` to a note's frontmatter
  for breaking changes.
- Write notes for the people who use Geordi, not for its maintainers.
- Run `sweet doctor` before finishing; it must pass (CI checks it on every pull request).
- Do not edit versions or changelogs by hand: `sweet bump` does that.
