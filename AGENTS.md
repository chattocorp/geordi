# Geordi

Self-hostable code forge and agent orchestrator. See README.md for stack and commands.

## Planning

All planning (features, bugs, tasks, design decisions) lives in the means collection at
`./planning`. Before starting work, list and read relevant items; track progress there.
Use the `planning` MCP server (`.mcp.json`) when available; call its `info` tool for the
schema and workflow. Otherwise use the CLI: `means info --path ./planning`.

## Architecture: event sourcing

All Geordi state is event-sourced (planning item `eqzzj`). Core: `src/lib/server/events/`.

- The only write is `store().append(...)`. Never write state anywhere else; no transactions.
- Each domain (e.g. `src/lib/server/issues.ts`) defines its event union (add it to `GeordiEvent`),
  an in-memory projection via `store.project(...)`, and command functions that check the
  projection and then append. Keep check-then-append synchronous (no `await` in between).
- Domains are factories (`createIssues(store)`) so tests can use `new EventStore(':memory:')`.
- Live UI: `query.live(async function* () { yield* store().live(() => ...) })`.
- Record `actor` on events (auth comes later).

## Conventions

- Svelte 5 runes, SvelteKit remote functions (`*.remote.ts`), `query.live` for live UI.
- Server-only code goes in `src/lib/server/`; import it as `#lib/server/<file>.ts`.
- Env vars are declared in `src/env.ts` and imported from `$app/env/private` (not `$env/*`).
- Before finishing: `pnpm check && pnpm lint && pnpm test`.
- Conventional commits.
