# Contributing

## Setup

Requires [mise](https://mise.jdx.dev/).

```sh
mise install
pnpm install
pnpm --filter @geordi/web exec playwright install chromium   # once, for the tests
pnpm dev
```

`pnpm dev` starts the forge on http://localhost:5173 and a daemon that connects to it,
with data in `./.data`.

| Command                               | Purpose                   |
| ------------------------------------- | ------------------------- |
| `pnpm dev`                            | Start all apps            |
| `pnpm check`                          | Type-check all packages   |
| `pnpm lint`                           | Check formatting and lint |
| `pnpm format`                         | Format all files          |
| `pnpm test`                           | Run all tests             |
| `pnpm --filter @geordi/web storybook` | Browse the design system  |

The tests render the UI's stories in a real browser.

Before you open a pull request: `pnpm check && pnpm lint && pnpm test && sweet doctor`.

## Working on Geordi in Geordi

In a Geordi workspace, use the workspace's jobs instead of `pnpm dev`, which uses fixed
ports. The setup script installs dependencies when the worktree is made.

- **Open → Geordi** starts an isolated copy: the **Web server** and **Agent daemon** jobs,
  on the workspace's ports. Its data (worktrees, agent turns, approvals, ports) stays in
  the worktree's `.data/`, apart from the installed app's `~/.geordi`. It starts empty:
  register a repository in it to begin.
- **Open → Storybook** shows the components.
- The web server reloads frontend changes; the daemon restarts when its source changes.
  Use the **Run** menu to stop and start jobs, for example to test reconnecting.
- Stop test agents before you discard a test copy: agent turns can outlive their daemon,
  as they do in the installed app.

## The desktop app

- **Run → Electron dev app** (or `pnpm desktop:dev`) builds and launches a separate
  **Geordi Dev**, with its data, logs and build in `.data/desktop/`, on the workspace's
  ports. It is a production build without hot reload: start the job again after a change.
- `pnpm desktop:package` builds the app into `apps/desktop/dist/` without touching the
  installed one.
- **Run → Install Electron app** (or `pnpm desktop:install`) builds the app, replaces
  `/Applications/Geordi.app` and reopens it. Agent turns go on, but terminals and jobs
  end. If Geordi refuses to quit, the old app stays. The installer's output is in
  `apps/desktop/dist/install.log`.

## Release notes

Every change people will notice needs a release note, committed with the change. Write it
for the people who use Geordi:

```sh
printf 'Describe the change.\n' | sweet change . --type feature --stdin
```

Types are in `.sweet.config.yml`. See
[Sweet Release](https://github.com/chattocorp/sweet-release).

## Decisions and backlog

- [`docs/adr/`](docs/adr/INDEX.md): architecture decision records
- [`docs/fdr/`](docs/fdr/INDEX.md): feature decision records
- [`planning/`](planning/): the backlog, managed with [means](https://github.com/hmans/means)
- [`apps/daemon/README.md`](apps/daemon/README.md): live checks of agent sessions
