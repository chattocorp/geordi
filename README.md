# Geordi

A self-hostable code forge and agent orchestrator.

- Browse and manage Git repositories
- Run coding agents (`claude -p`, `codex`) in workspaces: isolated Git worktrees with
  one conversation each, a live view of its changes, and terminals
- Let agents start and supervise other agents, in the same directory or in worktrees of
  their own, and see who is controlling what
- See each workspace's pull request, and move it along with one click: create it, fix its
  checks, merge it, archive

Geordi is in early development.

## Architecture

Geordi has two parts (see [ADR-002](docs/adr/ADR-002-forge-and-daemon-monorepo.md)):

- **Forge** (`apps/web`): a SvelteKit app for repositories and forge features. It stores
  everything as an append-only event log in SQLite
  ([ADR-001](docs/adr/ADR-001-event-sourcing.md)) and updates the UI live.
- **Daemon** (`apps/daemon`): runs on the machine with your code, manages worktrees and
  agent processes, and connects to the forge.

## Development

Requires [mise](https://mise.jdx.dev/).

```sh
mise install
pnpm install
pnpm dev
```

| Command                               | Purpose                   |
| ------------------------------------- | ------------------------- |
| `pnpm dev`                            | Start all apps            |
| `pnpm check`                          | Type-check all packages   |
| `pnpm lint`                           | Check formatting and lint |
| `pnpm format`                         | Format all files          |
| `pnpm test`                           | Run all tests             |
| `pnpm --filter @geordi/web storybook` | Browse the design system  |

The tests render the UI's stories in a real browser; install it once with
`pnpm --filter @geordi/web exec playwright install chromium`.

`pnpm dev` starts the forge on http://localhost:5173 and a daemon that connects to it. In
development, forge data is stored in `./.data`.

### Testing in a Geordi workspace

Use **Open → Geordi** to start an isolated development copy. The **Web server** and
**Agent daemon** jobs run in separate terminals. Use **Open → Storybook** to browse the
components, or the **Run** menu to start and stop individual jobs.
The setup script installs dependencies when Geordi creates the worktree.

These jobs use the workspace's assigned ports and keep all Geordi state in that
worktree's ignored `.data/` directory, including test worktrees, agent turns, tokens,
command approvals and port allocations. They do not use the installed app's `~/.geordi`
state. Register a repository in the test app to begin testing; it starts empty.

The web server reloads frontend changes, and the daemon restarts when its source changes.
Use the Run menu to stop and start jobs when testing reconnection. Data stays in place
between runs. Stop test agents before discarding a test instance: agent turns can survive
their daemon, just as they do in the installed app.

Use these jobs for workspace testing instead of `pnpm dev`, which uses fixed ports.
They test the browser app; `pnpm desktop` still uses the desktop app's usual ports and
profile, and `pnpm desktop:install` replaces the installed app.

Register a repository on the home page, open it, and start a workspace: one conversation
with an agent, in its own Git worktree on a new branch (`geordi/<id>`). See
[FDR-001](docs/fdr/FDR-001-workspaces.md).

## Running in production

```sh
pnpm --filter @geordi/web build
ORIGIN=http://localhost:3000 pnpm --filter @geordi/web start
node apps/daemon/src/main.ts
```

Or as a desktop app (macOS), which starts both and leaves agents working when you quit it:

```sh
pnpm desktop:install   # builds Geordi.app, puts it into /Applications and opens it
```

The app uses ports 7717 to 7719 and logs to `~/Library/Logs/Geordi/geordi.log`.

A repository can say what to run and where to look at it, in a `.geordi.yml` at its top
level. Its workspaces get buttons to start and stop the jobs and to open the links, and each
workspace gets ports of its own that never change, so that several can run side by side:

```yaml
jobs:
  db:
    command: docker compose up db
  web:
    command: pnpm dev --port $PORT
    needs: [db]

urls:
  app:
    url: http://localhost:{web}/
```

Jobs and links accept an optional `label` for their display name:

```yaml
jobs:
  web:
    label: Development server
    command: pnpm dev --port $PORT
urls:
  app:
    label: Open the app
    url: http://localhost:{web}/
```

Labels are single-line strings of 1–100 characters, with surrounding spaces removed.
Without a label, Geordi shows the key. Dependencies, URL placeholders, port variables,
and terminal identities always use the key. To label a single `run` command, write it
as `jobs.run` with a `command` and `label` instead of the `run` shorthand.

For a project with one thing to run, `run: pnpm dev --port $PORT` is enough. (A
`.geordi.toml` saying the same in TOML is still read where there is no `.geordi.yml`.)

> **Geordi has no authentication yet.** Anyone who can reach the forge can run agents on
> your machine, so it only listens on 127.0.0.1 and only answers to localhost hostnames.

> **Agents run without permission prompts or a sandbox by default.** They need to commit,
> push and use tools like `gh`, so they can do whatever your user can. The two variables
> below restrict them again, at the cost of the workspace actions that need the network.

The daemon connects once the forge has served its first request. Forge and daemon
authenticate each other with a shared token that the forge creates in its data directory.

### Forge

| Variable                    | Default                     | Purpose                                                   |
| --------------------------- | --------------------------- | --------------------------------------------------------- |
| `GEORDI_DATA_DIR`           | `~/.geordi`                 | Where Geordi stores its data                              |
| `GEORDI_DAEMON_PORT`        | `7700`                      | Port on 127.0.0.1 where daemons connect                   |
| `GEORDI_AGENT_MAX_DEPTH`    | `3`                         | How deep agents starting agents may nest (0 turns it off) |
| `GEORDI_AGENT_MAX_CHILDREN` | `5`                         | How many agents one agent may have running at once        |
| `GEORDI_ALLOWED_HOSTS`      | `localhost,127.0.0.1,[::1]` | Hostnames the forge answers to (DNS rebinding guard)      |
| `HOST`                      | `127.0.0.1`                 | Interface to listen on                                    |
| `ORIGIN`                    |                             | Public URL; required, or forms/commands are rejected      |
| `PORT`                      | `3000`                      | HTTP port                                                 |

### Daemon

| Variable                                                                                       | Default                        | Purpose                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GEORDI_FORGE_URL`                                                                             | `ws://127.0.0.1:7700`          | Forge to connect to                                                                                                                                                            |
| `GEORDI_FORGE_HTTP_URL`                                                                        | `http://127.0.0.1:3000`        | Where agents reach the forge's agent API                                                                                                                                       |
| `GEORDI_DAEMON_TOKEN_FILE`                                                                     | `~/.geordi/daemon-token`       | Forge's shared secret (the forge creates it in its data directory)                                                                                                             |
| `GEORDI_DAEMON_TOKEN`                                                                          |                                | The secret itself, instead of the file                                                                                                                                         |
| `GEORDI_WORKTREES_DIR`                                                                         | `~/.geordi/worktrees`          | Where workspace worktrees are created                                                                                                                                          |
| `GEORDI_TURNS_DIR`                                                                             | `~/.geordi/turns`              | Where running agent turns keep their output, so they survive a daemon restart                                                                                                  |
| `GEORDI_RUN_APPROVALS_FILE`                                                                    | `~/.geordi/run-approvals.json` | The run commands you have agreed to run, by repository                                                                                                                         |
| `GEORDI_PORTS_FILE`                                                                            | `~/.geordi/ports.json`         | The ports each workspace has been given                                                                                                                                        |
| `GEORDI_CLAUDE_PERMISSION_MODE`                                                                | `bypassPermissions`            | `--permission-mode` for `claude -p`, e.g. `auto` or `acceptEdits`                                                                                                              |
| `OPENROUTER_API_KEY`                                                                           |                                | Lets the daemon name workspaces, by asking a small model on [OpenRouter](https://openrouter.ai). Without it, a workspace keeps the first line of its first message as its name |
| `GEORDI_TITLE_MODEL`                                                                           | `anthropic/claude-haiku-5.5`   | The OpenRouter model that names workspaces                                                                                                                                     |
| `GEORDI_CODEX_SANDBOX`                                                                         |                                | Set to `workspace-write` to run Codex in its sandbox: no network, writes only in the worktree                                                                                  |
| `FORGES_GITHUB_TOKEN` and other [`FORGES_*`](https://forges.link/guides/environment-variables) |                                | Credentials for the forges your repositories are hosted on. For github.com, the GitHub CLI's login is used if this is unset                                                    |

With `GEORDI_CODEX_SANDBOX=workspace-write`, Codex runs in its sandbox. So that it can commit, the sandbox may also write
the repository's Git objects, refs, and logs, plus the worktree's own Git metadata. It can't
write `.git/hooks` or `.git/config`. Claude runs without a sandbox, limited by its permission
mode.

Codex's models are read from the list Codex keeps in `~/.codex` (or `CODEX_HOME`).

## Project docs

- [`planning/`](planning/): backlog, managed with [means](https://github.com/hmans/means)
- [`docs/adr/`](docs/adr/INDEX.md): architecture decision records
- [`docs/fdr/`](docs/fdr/INDEX.md): feature decision records
