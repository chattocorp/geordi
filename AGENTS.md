# Geordi

Self-hostable code forge and agent orchestrator. See README.md for stack and commands.

## Planning

All planning (features, bugs, tasks, design decisions) lives in the means collection at
`./planning`. Before starting work, list and read relevant items; track progress there.
Use the `planning` MCP server (`.mcp.json`) when available; call its `info` tool for the
schema and workflow. Otherwise use the CLI: `means info --path ./planning`.

## Conventions

- Svelte 5 runes, SvelteKit remote functions (`*.remote.ts`), `query.live` for live UI.
- Server-only code goes in `src/lib/server/`.
- Before finishing: `pnpm check && pnpm lint && pnpm test`.
- Conventional commits.
