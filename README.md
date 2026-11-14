# Geordi

A self-hostable code forge and agent orchestrator.

- Browse and manage local Git repositories
- Issues, pull requests, reviews
- Agent orchestration wrapping `claude -p` and `codex`

## Stack

- SvelteKit 3 (`adapter-node`; Geordi is a long-running process that owns agent subprocesses)
- Svelte 5 with experimental async + remote functions; live UI via `query.live`
- Tailwind CSS 4

## Development

```sh
mise install
pnpm install
pnpm dev
```

`pnpm check` (types), `pnpm lint`, `pnpm test`.
