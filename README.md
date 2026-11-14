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

In development, data is stored in `./.data`.

## Running in production

```sh
pnpm --filter @geordi/web build
ORIGIN=http://localhost:3000 node apps/web/build
```

| Variable          | Default     | Purpose                                              |
| ----------------- | ----------- | ---------------------------------------------------- |
| `GEORDI_DATA_DIR` | `~/.geordi` | Where Geordi stores its data                         |
| `ORIGIN`          |             | Public URL; required, or forms/commands are rejected |
| `PORT`            | `3000`      | HTTP port                                            |

## Project docs

- [`planning/`](planning/): backlog, managed with [means](https://github.com/hmans/means)
- [`docs/adr/`](docs/adr/INDEX.md): architecture decision records
- [`docs/fdr/`](docs/fdr/INDEX.md): feature decision records
