# Geordi

A self-hostable code forge and agent orchestrator.

- Browse and manage local Git repositories
- Issues, pull requests, reviews
- Agent orchestration wrapping `claude -p` and `codex`

## Stack

- SvelteKit 3 (`adapter-node`; Geordi is a long-running process that owns agent subprocesses)
- Svelte 5 with experimental async + remote functions; live UI via `query.live`
- Event-sourced state in SQLite (`node:sqlite`), see `src/lib/server/events/`
- Tailwind CSS 4

## Development

```sh
mise install
pnpm install
pnpm dev
```

`pnpm check` (types), `pnpm lint`, `pnpm test`. In development, mise sets `GEORDI_DATA_DIR` to `./.data`.

## Running in production

```sh
pnpm build
ORIGIN=http://localhost:3000 node build
```

| Variable          | Default     | Purpose                                              |
| ----------------- | ----------- | ---------------------------------------------------- |
| `GEORDI_DATA_DIR` | `~/.geordi` | Where Geordi stores its data                         |
| `ORIGIN`          |             | Public URL; required, or forms/commands are rejected |
| `PORT`            | `3000`      | HTTP port                                            |
