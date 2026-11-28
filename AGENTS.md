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
  Its Open Graph image is a photograph of `src/og/card.astro`: after a change that shows in
  it, make it anew with `pnpm --filter @geordi/website og`.
- `packages/ui`: Svelte components and action rules shared by the forge and website demo (ADR-011).
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
- `pnpm desktop:dev`: run an isolated Electron app on the workspace ports

Before finishing a task: `pnpm check && pnpm lint && pnpm test && sweet doctor`.

## Working on Geordi inside Geordi

The person runs the installed app (`/Applications/Geordi.app`) all day, and agents work in
it, perhaps you.

- Test desktop changes with the **Electron dev app** workspace job. For web and daemon
  changes, use the `web` and `daemon` jobs. Their data is the worktree's `.data/`,
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
  - A **project** (FDR-012) is a workspace in no repository (`repoId: null`), for
    orchestrating: its agent works in a folder of its own (`ProjectRef`, `projects.ts` in the
    daemon; kept when archived), with no worktree, so `ref()` refuses it and `locate()` says
    where it works. Projects are deprecated: new ones can't be started (planning `nzqqn`
    removes them); existing ones are listed above the repositories. Code that assumes a repository must leave projects out.
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
  - **Workspace actions** (FDR-003) are derived from state by `@geordi/ui/actions` (pure, and
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
  daemon hands URL and token to the CLI. Repository agents can read peers in accessible repositories, but message only their descendants and their parent. Messages within a delegation steer by default, including child turn-end reports. Set `interrupt: false` to queue a follow-up. Stopping and archiving are supervisor actions. External clients get a named token from Settings (`agent-access.ts`) for chosen repositories (`repoIds`; never later ones), see only those, start agents in a `repository` and supervise those (`startedBy`), and may message any agent without interrupting it. A child's own worktree starts from the repository’s base, or from the branch the caller names (`base`), and its changes are compared with that one branch until it has a pull request (FDR-001). A person picks it in the composer and may change it in the Changes pane; an agent that moved its branch says so with `set_base` (the `workspace.based` event). A named branch is the upstream’s copy (`origin/…`) where there is one. Repository agents can start a child in another accessible repository with `repository`. It can also send a reviewer into a descendant’s worktree with `workspace`. Archiving follows the whole subtree, in every repository, and agents sharing those worktrees. The sidebar is an outline of items (FDR-019, ADR-016), which is the chain of command (FDR-016): an item is a line of text, some have a workspace attached (the item has the workspace's ID; its text is the workspace's name). One without is a todo where a workspace is above it and a folder elsewhere (`isTodo`: derived, never stored); the sidebar shows folders and workspaces (`withoutTodos` in `#lib/family.ts`), and todos show only in their workspace's Plan. The outline is kept by the workspaces' projection (`items.ts` for its rules; `item.*` events, and `workspace.created`/`workspace.moved` for workspaces' items). A workspace's `parentId` is derived: the workspace of the nearest item above it that has one, not who started it. A person moves items (`move` in `workspaces.ts`), and so hands workspaces to another supervisor. A workspace the person starts on no item lands in the Inbox (`INBOX` in `#lib/family.ts`: a place listed first, not an item; `inbox` on `workspace.created`), until they file it (Cmd-Shift-M: `moveTargets` in `#lib/components/commands.ts`). An agent keeps its workspace's scope (the items under it, down to the next workspace; `scopeOf`): it sees them every turn (`outlineBrief` in `instructions.ts`) and has `list_items`, `add_item`, `move_item`, `update_item` and `remove_item`, refused outside its scope. `start_agent` takes `item` (start it on one of the caller's items: the item becomes the workspace) or `under` (file it under one). The calling workspace is the parent of what it starts
  and the `actor` of the events. A project's agents act for the person: they start agents
  in any repository, or alongside any workspace's agent there (`workspace`), and supervise
  and archive any agent in a repository or in their own project; they never see another
  project (`sees`). The operations live in `workspaces().agents`; add a tool by
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
  layout keeps the sidebar toggle in the window frame and reserves its place in the page header (`setTitleBarLead`).
  What the page can ask of the app is in `preload.cjs` (`window.geordiDesktop`: the Dock
  count, notifications). **The app never plays sound itself**: on macOS that has the system
  ask for the microphone. Notifications are shown by the main process, with sounds that
  are files in the bundle and that the system plays (FDR-008).
- **Repository configuration (FDR-006).** A repository's `.geordi.yml` names tasks, each with a command, a `url`, or both, the ports its command listens on (`ports: [http, live]`; none unless named), and its dependencies and defaults.
  Nothing else is read (no `jobs`, `urls`, `run`, `ports`, nor `.geordi.toml`). Every workspace also has ten spare ports. The daemon reads
  it (`config.ts`: the workspace's file, else the one on the branch work starts from) and
  reports it with the worktree's state. Each task's command runs in a terminal named `JOB_TERMINAL` +
  its name, and is running only until its command ends (`terminal.ended`; the terminal
  stays, to be read); the forge says which to start when (`jobs.ts`). A workspace's ports are assigned
  once per port name (names are the workspace's, each one task's) and written down (`ports.ts`), and reach everything in it as `GEORDI_PORT…`. Commands
  run only as a person saw and agreed to them (`approvals.ts`). The daemon runs the `setup`
  script by itself when it makes a worktree (the first turn waits for it; `setUp` in
  `main.ts`) and `teardown` before it removes one, each in a job-like terminal it tells the
  forge of (`terminal.opened`). The settings are described
  for agents in `CONFIG_SETTINGS`; a new one goes there and into `parseConfig`.
- **Changesets (FDR-007).** In a repository that uses a release tool, a workspace shows the
  change notes it adds and the versions they lead to. One adapter per tool in the daemon
  (`releases.ts`; Sweet Release and Changesets) says whether a repository uses it and asks the tool
  what is pending; everything else deals in packages, versions and notes (`ReleasePlan`).
  A tool is run with `gitEnv`, like our own git: never trusting the worktree's Git metadata.
- **Standings.** How each worktree's work stands (its changes, its pull request, its checks)
  is kept in one place in the forge, `standings.ts`, for the sidebar and for whoever has a
  workspace open: both show the same answer. Local Git and the upstream forge are asked
  separately, so that neither waits for the other; local Git when the daemon says a
  worktree changed, upstream now and then (the stalest first) and at once when something
  may show there: a push, another branch, the end of a turn, a merge (`look`). A lookup
  that fails keeps what was known and says so (`upstreamProblem`). In memory only;
  `standingOf` puts it into an icon and words.
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
  in use (`watch.ts`, in a thread of its own, once per repository: ADR-014; their files too where someone has one open), the forge then loads
  their state once for everyone (`standings.ts`; `watchers.ts` adds what only a viewer
  needs) and sends it with the workspace's view (`git`). Browsers don't query
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
    `surface`, `sunken`, `bubble`, `ink`, `prose` (long text), `muted`, `line`, `accent`,
    `accent-ink`, `on-accent`, `danger`, `warning`, `ok`, `on-ok`, `merged`, `on-merged`, plus `claude`/`codex`) for light and dark
    mode, the relative `hover` (a see-through tint of `ink`: use it for every hover wash, so
    it shows on any background) `faint` (`muted`, fainter still, for what need not be read: placeholders, rows put aside; never `text-muted/NN`), four font sizes, and the radii `rounded-card`, `rounded-control`, `rounded-full`.
  - **Utilities** (`@utility` in the same file): `raised` (the surface, shadow and ring that cards, inputs and small floating controls share), `card`, `card-float`, `input`,
    `message`, `sheet`, `sheet-quiet`, `pane-bar`, `tools` (icon buttons side by side, always `gap-px` apart), `scroller`, `render-near` (a long page's part painted only near the screen), `scrollbar-none`, `zoomable` (a row a Cmd-click zooms into: its cursor), `strike-draw` (a line drawn through text just ticked off), `page`, `title`, `heading`, `label`, `code`, `code-dense`, `file-link`, `quiet-action`, `item` (every row you can pick; `item-active` for the current one, `item-picked` for one chosen or in hand),
    `menu-item`, `tab-active`, `tab-inactive`, `tab-drop-before`/`-after`, `row-drop-before`/`-after`, `dialog-actions`, `scroll-fade`, `scroll-fade-x`, `empty`, `dot`, `indicator-action`, `picture-raised`/`-gloss`/`-plate`,
    `tone-ok`/`-danger`/`-merged`/`-accent` (a colour that says something, as a soft see-through tint with text in it: never a hand-mixed `bg-…/NN text-…`; one that can be pressed adds `hover:bg-current/20`).
  - **Components** in `@geordi/ui` (`Badge`, `Button`, `ButtonGroup`, `Composer`, `Disclosure`, `Keys`, `LinkCard`, `Loading`, `PaneTabs`, `Ring`, `RowLabel` (a row's sign and title, and what folds under it: every foldable group of rows), `Segmented`, `Spinner`, `StatusIcon`, `TitleBar`) and `#lib/ui/` (`CommandPalette`, `ContextMenu`, `Dialog`, `ImageAttachments`, `ImageViewer`, `Notice`, `Page`, `Panes`,
    `Select`, `SoundPlayer`, `Split`, `Tooltip`): generic, no domain knowledge. Domain components live in
    `#lib/components/` or, when both apps use them, in `@geordi/ui`.
  - Use `StatusIcon` for passive status icons. Show the glyph directly on the surrounding surface. Passive icons have no click interaction or pointer cursor. Use `indicator-action` on a link or button for an available action. It has a filled circle and pointer cursor at rest and expands into a labelled pill on hover or keyboard focus.
  - Raw Tailwind is for layout (flex, grid, spacing). A visual pattern used twice becomes a
    utility (styling only) or a component (behaviour or structure). Never use arbitrary
    values or raw colours.
  - Context menus: `{@attach contextMenu(() => items)}` (`#lib/ui/menu.svelte.ts`) on the
    element; the layout renders the one `ContextMenu` that shows them.
  - Every `lib/ui` component has a `*.stories.svelte` next to it (Svelte CSF; use
    `<Story name="…" asChild>` to render your own markup). `pnpm test` renders every story
    in a browser. Add or update stories with every UI change. `Foundations/Screens` mocks whole screens
    from the system's parts: look there (in both colour modes) after changing a token or utility.
  - For visual changes, include a screenshot of the affected UI in your final reply.
- **Sheets, not lines.** Everything on screen is a rounded sheet laid into the frame
  (`bg-frame`: the window and its title bar), 8px from the window's edge and from the next
  sheet: the sidebar, a page's content, and in a workspace the conversation, the changes
  and the terminals. `sheet` is what is read (the lightest tone); `sheet-quiet` is what is
  beside it (a tone between that and the frame's). Use `grouped-rows` for task groups and Changes sections. Elsewhere, shapes part things: no separator lines
  between or inside sheets (a `Split` between sheets is `bare`, and its gap is what is
  dragged). What sits in a sheet's corner (a tab, a row) is 8px from both edges, so that its
  corner follows the sheet's. What paints its own background takes it from `--pane`.
- **Look and feel:** dark mode is deliberately mid-tone, not near-black. Gold `accent` is for
  the primary action and things that are live. The only ambient motion is for things at
  work: the Braille `Spinner` for agents, `bar-running` (and the light round a `Ring`) for checks still running, gold turning arrows for a task at work that has no ports, and `edge-live` round the reply box of an agent at work. Surfaces use shadows with a faint ring rather than hard borders. Icons: Iconify via
  `icon-[lucide--name]`; Heroicons (`icon-[heroicons--name-solid]`) only where a filled icon is needed. Fonts: IBM Plex Sans and JetBrains Mono from Fontsource (no remote
  loading); mono only for actual code (paths, branches, commands, output). Terminals add
  Nerd Font symbols for prompt icons (`--font-terminal`; the file is in `#lib/fonts/`).
- **Settings (FDR-005):** one page, `/settings/[[section]]` (`#lib/components/Settings.svelte`),
  opened with `openSettings(section?)` or Cmd/Ctrl+,. Preferences of this browser (the theme,
  `#lib/theme.svelte.ts`) live in localStorage; what belongs to the installation
  (repositories; choices in `preferences.ts`, such as telling Claude Code that Geordi started
  it) is events.
- **Workspace UI:** components in `#lib/components/workspace/`. The frame is fixed, three
  areas: main | side above dock. Each is a `Panes` with its own layout tree (`#lib/layout.ts`,
  pure functions); only the main area can be split, the two beside it are one row of tabs
  each (`splits={false}`). Windows are tabs named after what they show: `chat` (pinned to
  the main area), `agent:<id>` (an agent working alongside), `draft` (a conversation not
  begun yet), `changes`, `plan` (the workspace's scope in the outline, FDR-019), `changeset`, `diff` (one tab titled with the selected filename) and `terminal:<name>`. All but `chat`
  can be dragged to any area, and into another order (`Panes` props `accepts`/`onreceive`,
  shared drag state in `drag.svelte.ts`). Which windows exist follows from the workspace's
  state; only their arrangement is a per-browser preference (`persisted`), not an event.
  The ribbon at the top (`WorkspaceActions`) says where the work stands and what to do
  next, from `@geordi/ui/actions`.
- **Diffs** are rendered by `@geordi/ui/DiffView.svelte` with `@pierre/diffs`
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
  for breaking changes. The notes are shown in the app (Settings → Release notes) and on the
  website (`/releases`), so the type says how much a change matters to the person:
  - `feature`, `fix`, `performance`: the usual note for a change.
  - `highlight`: in addition to that note, for the few changes of a release worth reading
    about first. It bumps nothing; the change's other note does.
  - `polish`: instead of `fix`, for small things people need not read about (spacing,
    colours, wording). Shown folded away.
  - `website`: changes to the website only. No note in the app.
- Address the person who uses Geordi directly. Use “you” or “your” where natural.
  Describe what they can now do or what now works as expected for them.
- Run `sweet doctor` before finishing; it must pass (CI checks it on every pull request).
- Do not edit versions or changelogs by hand: `sweet bump` does that.
