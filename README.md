# Geordi

A self-hostable code forge and agent orchestrator.

- Browse and manage Git repositories
- Issues, pull requests, reviews
- Run coding agents (`claude -p`, `codex`) in workspaces: isolated Git worktrees with
  several agent sessions side by side, a live view of their changes, and a terminal
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

Register a repository on the home page, open it, and start a workspace: one conversation
with an agent, in its own Git worktree on a new branch (`geordi/<id>`). See
[FDR-001](docs/fdr/FDR-001-workspaces.md).

## Running in production

```sh
pnpm --filter @geordi/web build
ORIGIN=http://localhost:3000 pnpm --filter @geordi/web start
node apps/daemon/src/main.ts
```

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

| Variable                                                                                       | Default                      | Purpose                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GEORDI_FORGE_URL`                                                                             | `ws://127.0.0.1:7700`        | Forge to connect to                                                                                                                                                                                                |
| `GEORDI_FORGE_HTTP_URL`                                                                        | `http://127.0.0.1:3000`      | Where agents reach the forge's agent API                                                                                                                                                                           |
| `GEORDI_DAEMON_TOKEN_FILE`                                                                     | `~/.geordi/daemon-token`     | Forge's shared secret (the forge creates it in its data directory)                                                                                                                                                 |
| `GEORDI_DAEMON_TOKEN`                                                                          |                              | The secret itself, instead of the file                                                                                                                                                                             |
| `GEORDI_WORKTREES_DIR`                                                                         | `~/.geordi/worktrees`        | Where workspace worktrees are created                                                                                                                                                                              |
| `GEORDI_CLAUDE_PERMISSION_MODE`                                                                | `bypassPermissions`          | `--permission-mode` for `claude -p`, e.g. `auto` or `acceptEdits`                                                                                                                                                  |
| `OPENROUTER_API_KEY`                                                                           |                              | Lets the daemon name workspaces: it asks a small model on [OpenRouter](https://openrouter.ai), through the [Pi](https://pi.dev) SDK. Without it, a workspace keeps the first line of its first message as its name |
| `GEORDI_TITLE_MODEL`                                                                           | `anthropic/claude-haiku-5.5` | The OpenRouter model that names workspaces                                                                                                                                                                         |
| `GEORDI_CODEX_SANDBOX`                                                                         |                              | Set to `workspace-write` to run Codex in its sandbox: no network, writes only in the worktree                                                                                                                      |
| `FORGES_GITHUB_TOKEN` and other [`FORGES_*`](https://forges.link/guides/environment-variables) |                              | Credentials for the forges your repositories are hosted on. For github.com, the GitHub CLI's login is used if this is unset                                                                                        |

Codex runs in its `workspace-write` sandbox. So that it can commit, the sandbox may also write
the repository's Git objects, refs, and logs, plus the worktree's own Git metadata. It can't
write `.git/hooks` or `.git/config`. Claude runs without a sandbox, limited by its permission
mode.

## Project docs

- [`planning/`](planning/): backlog, managed with [means](https://github.com/hmans/means)
- [`docs/adr/`](docs/adr/INDEX.md): architecture decision records
- [`docs/fdr/`](docs/fdr/INDEX.md): feature decision records
