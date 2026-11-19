# Geordi

Self-hostable code forge and agent orchestrator. See `README.md` for an overview.

## Repository layout

pnpm monorepo:

- `apps/web`: the forge (SvelteKit). Repositories, forge features, and the event log.
- `apps/daemon`: the agent daemon. Worktrees and agent processes; connects to the forge.
- `apps/desktop`: the desktop app (Electron). Starts forge and daemon, and shows the forge.
- `apps/cli`: the `geordi` npm package (`npx geordi`). Starts forge and daemon in a terminal.
- `packages/launch`: how both stage and start forge and daemon (`stage.js`, `services.js`).
- `apps/website`: the website (Astro, static). Drawn with the forge's design system: it
  imports `apps/web/src/routes/layout.css`, so a change to tokens or utilities shows there too.
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
- `pnpm cli`: build the npm package into `apps/cli/stage` and run it
- `pnpm desktop`: build the desktop app and run it from `apps/desktop/stage`
- `pnpm desktop:install`: build it, replace `/Applications/Geordi.app` and open it

Before finishing a task: `pnpm check && pnpm lint && pnpm test && sweet doctor`.

## Working on Geordi inside Geordi

The person runs the installed app (`/Applications/Geordi.app`) all day, and agents work in
it, perhaps you.

- `pnpm desktop:install` quits and replaces that app. Agents' turns go on (ADR-007), but
  open terminals and running jobs end, and an agent waiting on another one sees a
  connection error for a moment. Do it when a change is ready to be used, not to try
  something out: for that, run a second instance on other ports with its own data
  (`GEORDI_DATA_DIR`, `PORT`, `GEORDI_DAEMON_PORT`, and a daemon pointed at it).
  In a workspace, the `web` and `daemon` jobs are that: their data is the worktree's `.data/`,
  seeded with two sample repositories (`scripts/seed-dev-data.mjs`), each with a local bare
  `origin`. The `reset` job starts that data over.
- When something misbehaves there, look before you change anything: the page's console
  (clicks that do nothing were six connections used up, and it said so), the forge's and
  daemon's log (`~/Library/Logs/Geordi/geordi.log`), and for macOS's own prompts
  `/usr/bin/log show --predicate 'process == "tccd"'`, which names the process that asked.
  A fix for a cause that was only guessed at costs the person a reinstall each time.
- The installed app's data is `~/.geordi` (events in `events.db`, SQLite): reading it to
  see what happened in a workspace is fine; never write to it.

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
  - Record state with `store().append(...)`. Image bytes are the exception. Publish them under
    their content hash in `blobs/` before appending the image reference (ADR-001).
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
  - Turns are the agent's to begin and end (ADR-010): the daemon says `turn.started` (an
    agent may start one unasked, when something it ran in the background ends) and how it
    ended. The forge drops what a daemon says of a workspace that is not working, as far as
    it knows: a daemon may report late, or twice.
  - A message to a working agent either steers it (sent at once: it reaches the agent in
    the middle of its turn) or queues (`workspace.queued`: sent when the turn ends).
  - An agent can ask the person something (`question`, answered with `workspace.answered`
    and `agent.answer`); the workspace is `asking` while a blocking form needs input. The forge retries saved answers until the host acknowledges the question ID or the request closes.
  - A workspace is named after the first line of its first message, then after the title
    its agent gives its root session (ACP `session_info_update`, the `title` event;
    `titleFromAgent` drops Codex's echo of the prompt), until someone names it on purpose
    (an `actor` on `workspace.titled`: a caller's `title`, or the agent's `name_workspace`).
  - **Workspace actions** (FDR-003) are derived from state by `#lib/actions.ts` (pure, and
    tested); most just `say` something to the agent.
  - Agents run without permission prompts by default (they must commit, push and use `gh`).
  - Every turn tells the agent that it works in Geordi, and how (`instructions.ts` in the
    forge; the adapters add it to the CLI's system prompt).
  - The daemon runs git in agent-writable worktrees: always through `gitIn`, which never
    trusts the worktree's own Git metadata.
  - A detached host runs a pinned ACP wrapper per active workspace (ADR-010).
    The host owns the wrapper's pipes. The daemon follows its output and advances its
    cursor after the forge acknowledges the event. A reconnecting daemon reports idle
    sessions too, so a background result can wake a workspace after a forge restart.
    Test session changes by restarting both services during a turn.
  - Model and effort choices come from the provider offers (FDR-004). The host applies
    the selected values with ACP session configuration. Add providers to `AGENTS`, the
    daemon offers, the packaged wrapper dependencies, and the live session tests.
- **Upstream forges (ADR-006).** The daemon talks to the forge a repository is hosted on
  through the `forges` library (`apps/daemon/src/upstream.ts`): never a forge-specific
  client. Credentials come from `FORGES_*` variables in the daemon's environment, or the
  GitHub CLI's login. Upstream state is live data: asked on demand, cached briefly, never
  stored.
- **Agent API (ADR-004, FDR-002).** Agents start and supervise other agents through an MCP
  server on the forge (`mcp.ts`, served at `/mcp`). The forge derives a token per workspace; the
  daemon hands URL and token to the CLI. Any caller can read any workspace; messaging and stopping follow parentage. External clients get a named token from Settings (`agent-access.ts`) for chosen repositories (`repoIds`; never later ones), see only those, start agents in a `repository` and supervise those (`startedBy`), and may message any agent without interrupting it. The calling workspace is the parent of what it starts
  and the `actor` of the events. The operations live in `workspaces().agents`; add a tool by
  adding an entry to `tools` in `mcp.ts`.
- **Desktop app (ADR-008).** `apps/desktop/src/main.js` starts the forge's production build and
  the daemon as they are, on ports of its own (7717, 7718, and 7719 for browsers' WebSocket), with data in `~/.geordi`; `pnpm dev`
  keeps its data in `.data/`, so both can run at once. The app must not grow a second way of
  running anything: configure forge and daemon through their environment. The `geordi`
  command (`apps/cli`) starts them the same way: both use `@geordi/launch`, which stages
  the services (the agents' ACP wrappers bundled, so none of the agents' own programs ship)
  and says what each is started with. The web app's
  packages are all `devDependencies`, so that its build needs nothing but Node. Its window has
  no title bar: every page starts with a `TitleBar`, which in the app (`desktop:` variant) makes
  room for the window's buttons and is what the window is dragged by (`window-drag`, on
  the bar itself; what can be used in it is exempt). The
  layout puts the sidebar toggle and back/forward into it (`setTitleBarLead`).
  What the page can ask of the app is in `preload.cjs` (`window.geordiDesktop`: the Dock
  count, notifications). **The app never plays sound itself**: on macOS that has the system
  ask for the microphone. Notifications are shown by the main process, with sounds that
  are files in the bundle and that the system plays (FDR-008). Installing signs the bundle
  (ad hoc), without which macOS shows none of its notifications; macOS may ask for
  permissions again after an install.
- **Repository configuration (FDR-006).** A repository's `.geordi.yml` (YAML; a `.geordi.toml` is still read where there is none) names jobs to run
  (with what they need), links to open, and how many ports a workspace gets. The daemon reads
  it (`config.ts`: the workspace's file, else the one on the branch work starts from) and
  reports it with the worktree's state. Each job runs in a terminal named `JOB_TERMINAL` +
  its name, and is running only until its command ends (`terminal.ended`; the terminal
  stays, to be read); the forge says which to start when (`jobs.ts`). A workspace's ports are assigned
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
  (`views.ts`: `navigation`, `workspace`) and terminal output to whoever
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
  - **Tokens** in `apps/web/src/routes/layout.css`: semantic colours (`bg`, `frame`, `sidebar`,
    `surface`, `sunken`, `bubble`, `ink`, `prose` (long text), `muted`, `line`, `accent`, `accent-soft`,
    `accent-ink`, `on-accent`, `danger`, `danger-soft`, `ok`, `on-ok`, `merged`, `on-merged`, plus `claude`/`codex`) for light and dark
    mode, the relative `hover` (a see-through tint of `ink`: use it for every hover wash, so
    it shows on any background), four font sizes, and the radii `rounded-card`, `rounded-control`, `rounded-full`.
  - **Utilities** (`@utility` in the same file): `card`, `card-float`, `card-link`, `input`,
    `message`, `sheet`, `sheet-quiet`, `pane-bar`, `scroller`, `page`, `title`, `heading`, `label`, `code`, `code-dense`, `file-link`, `item`,
    `item-active`, `tab-active`, `menu-item`, `menu-item-active`, `empty`, `dot`, `dot-live`.
  - **Components** in `#lib/ui/` (`Button`, `ButtonGroup`, `Badge`, `Composer`, `ContextMenu`, `Dialog`, `Disclosure`, `ImageViewer`, `Notice`, `Page`, `Panes`,
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
  - For visual changes, include a screenshot of the affected UI in your final reply.
- **Sheets, not lines.** Everything on screen is a rounded sheet laid into the frame
  (`bg-frame`: the window and its title bar), 8px from the window's edge and from the next
  sheet: the sidebar, a page's content, and in a workspace the conversation, the changes
  and the terminals. `sheet` is what is read (the lightest tone); `sheet-quiet` is what is
  beside it (a tone between that and the frame's). Shapes part things: no separator lines
  between or inside sheets (a `Split` between sheets is `bare`, and its gap is what is
  dragged). What sits in a sheet's corner (a tab, a row) is 8px from both edges, so that its
  corner follows the sheet's. What paints its own background takes it from `--pane`.
- **Look and feel:** dark mode is deliberately mid-tone, not near-black. Gold `accent` is for
  the primary action and things that are live. The only ambient motion is for things at
  work: the `.visor` sweep and the Braille `Spinner` for agents, `bar-running` for checks still running, and `edge-live` round the reply box of an agent at work. Surfaces use shadows with a faint ring rather than hard borders. Icons: Iconify via
  `icon-[lucide--name]`. Fonts: IBM Plex Sans and JetBrains Mono from Fontsource (no remote
  loading); mono only for actual code (paths, branches, commands, output). Terminals add
  Nerd Font symbols for prompt icons (`--font-terminal`; the file is in `#lib/fonts/`).
- **Settings (FDR-005):** one page, `/settings/[[section]]` (`#lib/components/Settings.svelte`),
  opened with `openSettings(section?)` or Cmd/Ctrl+,. Preferences of this browser (the theme,
  `#lib/theme.svelte.ts`) live in localStorage; what belongs to the installation
  (repositories) is events.
- **Workspace UI:** components in `#lib/components/workspace/`. The frame is fixed, three
  areas: main | side above dock. Each is a `Panes` with its own layout tree (`#lib/layout.ts`,
  pure functions); only the main area can be split, the two beside it are one row of tabs
  each (`splits={false}`). Windows are tabs named after what they show: `chat` (pinned to
  the main area), `agent:<id>` (an agent working alongside), `draft` (a conversation not
  begun yet), `changes`, `changeset`, `diff:<path>` and `terminal:<name>`. All but `chat`
  can be dragged to any area, and into another order (`Panes` props `accepts`/`onreceive`,
  shared drag state in `drag.svelte.ts`). Which windows exist follows from the workspace's
  state; only their arrangement is a per-browser preference (`persisted`), not an event.
  The ribbon at the top (`WorkspaceActions`) says where the work stands and what to do
  next, from `#lib/actions.ts`.
- **Diffs** are rendered by `#lib/components/DiffView.svelte` with `@pierre/diffs`
  (https://diffs.com) from both whole file versions, which is what makes context
  expandable. It renders into a shadow root; style it through its `--diffs-*` properties.
- **Agent output** is rendered as Markdown with `markdown-it` (raw HTML disabled), via
  `#lib/components/Markdown.svelte`. An image in it is shown only if it is a file where the
  agent works: the daemon reads it (`picture.ts`, pictures only) and the forge serves it at
  `/workspaces/[id]/picture`. Never load one from the web: displaying output must not send
  anything anywhere.
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
- Address the person who uses Geordi directly. Use “you” or “your” where natural.
  Describe what they can now do or what now works as expected for them.
- Run `sweet doctor` before finishing; it must pass (CI checks it on every pull request).
- Do not edit versions or changelogs by hand: `sweet bump` does that.
