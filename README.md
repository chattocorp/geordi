# Geordi

A self-hostable code forge and agent orchestrator.

- Browse and manage Git repositories
- Issues, pull requests, reviews
- Run coding agents (`claude -p`, `codex`) in isolated Git worktrees, tightly integrated
  with the forge

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

| Command       | Purpose                   |
| ------------- | ------------------------- |
| `pnpm dev`    | Start all apps            |
| `pnpm check`  | Type-check all packages   |
| `pnpm lint`   | Check formatting and lint |
| `pnpm format` | Format all files          |
| `pnpm test`   | Run all tests             |

`pnpm dev` starts the forge on http://localhost:5173 and a daemon that connects to it. In
development, forge data is stored in `./.data`.

Register a repository on the home page, open it, and start an agent session. Each session
gets its own Git worktree on a new branch (`geordi/<id>`).

## Running in production

```sh
pnpm --filter @geordi/web build
ORIGIN=http://localhost:3000 node apps/web/build
node apps/daemon/src/main.ts
```

The daemon connects once the forge has served its first request.

### Forge

| Variable             | Default     | Purpose                                              |
| -------------------- | ----------- | ---------------------------------------------------- |
| `GEORDI_DATA_DIR`    | `~/.geordi` | Where Geordi stores its data                         |
| `GEORDI_DAEMON_PORT` | `7700`      | Port on 127.0.0.1 where daemons connect              |
| `ORIGIN`             |             | Public URL; required, or forms/commands are rejected |
| `PORT`               | `3000`      | HTTP port                                            |

### Daemon

| Variable                        | Default                  | Purpose                                                            |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `GEORDI_FORGE_URL`              | `ws://127.0.0.1:7700`    | Forge to connect to                                                |
| `GEORDI_DAEMON_TOKEN_FILE`      | `~/.geordi/daemon-token` | Forge's shared secret (the forge creates it in its data directory) |
| `GEORDI_DAEMON_TOKEN`           |                          | The secret itself, instead of the file                             |
| `GEORDI_WORKTREES_DIR`          | `~/.geordi/worktrees`    | Where session worktrees are created                                |
| `GEORDI_CLAUDE_PERMISSION_MODE` | `acceptEdits`            | `--permission-mode` for `claude -p`                                |

Codex runs in its `workspace-write` sandbox, extended to the repository's `.git` so it can
commit.

## Project docs

- [`planning/`](planning/): backlog, managed with [means](https://github.com/hmans/means)
- [`docs/adr/`](docs/adr/INDEX.md): architecture decision records
- [`docs/fdr/`](docs/fdr/INDEX.md): feature decision records
