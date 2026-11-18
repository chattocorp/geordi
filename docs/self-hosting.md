# Self-hosting

Geordi has two parts (see [ADR-002](adr/ADR-002-forge-and-daemon-monorepo.md)):

- The **forge** (`apps/web`), a SvelteKit app, shows repositories and workspaces. It
  stores everything as an append-only event log in SQLite
  ([ADR-001](adr/ADR-001-event-sourcing.md)).
- The **daemon** (`apps/daemon`) runs on the machine with your code. It manages worktrees,
  agents and terminals, and connects to the forge.

The desktop app starts both. To run them yourself, from a checkout (see
[Contributing](../CONTRIBUTING.md) for the tools):

```sh
pnpm install
pnpm --filter @geordi/web build
ORIGIN=http://localhost:3000 pnpm --filter @geordi/web start
node apps/daemon/src/main.ts
```

The daemon connects once the forge has served its first request. They authenticate each
other with a shared token, which the forge creates in its data directory.

> **Geordi has no authentication yet.** Keep the forge on 127.0.0.1.

## Desktop app

The desktop app uses ports 7717 to 7719, keeps its data in `~/.geordi`, and logs to
`~/Library/Logs/Geordi/geordi.log` on macOS. Agents keep working when you quit it.

## Forge settings

- `ORIGIN`: The public URL. Required, or forms and commands are rejected.
- `HOST` (default `127.0.0.1`), `PORT` (default `3000`): Where to listen for HTTP.
- `GEORDI_DATA_DIR` (default `~/.geordi`): Where Geordi stores its data.
- `GEORDI_DAEMON_PORT` (default `7700`): The port on 127.0.0.1 where daemons connect.
- `GEORDI_ALLOWED_HOSTS` (default `localhost,127.0.0.1,[::1]`): The hostnames the forge answers to, a guard against DNS rebinding.
- `GEORDI_AGENT_MAX_DEPTH` (default `3`): How deep agents starting agents may nest. `0` turns it off.
- `GEORDI_AGENT_MAX_CHILDREN` (default `5`): How many agents one agent may have running at once.

## Daemon settings

- `GEORDI_FORGE_URL` (default `ws://127.0.0.1:7700`): The forge to connect to.
- `GEORDI_FORGE_HTTP_URL` (default `http://127.0.0.1:3000`): Where agents reach the forge's agent API.
- `GEORDI_DAEMON_TOKEN_FILE` (default `~/.geordi/daemon-token`), `GEORDI_DAEMON_TOKEN`: The forge's shared secret: the file the forge created, or the secret itself.
- `GEORDI_WORKTREES_DIR` (default `~/.geordi/worktrees`): Where workspace worktrees are created.
- `GEORDI_SESSIONS_DIR` (default `~/.geordi/sessions`): Where agent sessions are kept, so that they survive a daemon restart.
- `GEORDI_RUN_APPROVALS_FILE` (default `~/.geordi/run-approvals.json`): The commands you have agreed to run, by repository.
- `GEORDI_PORTS_FILE` (default `~/.geordi/ports.json`): The ports each workspace has been given.
- `OPENROUTER_API_KEY`: Lets the daemon name workspaces by asking a small model on [OpenRouter](https://openrouter.ai). Without it, a workspace is named after the first line of its first message.
- `GEORDI_TITLE_MODEL` (default `anthropic/claude-haiku-5.5`): The OpenRouter model that names workspaces.
- `FORGES_GITHUB_TOKEN` and other [`FORGES_*`](https://forges.link/guides/environment-variables): Credentials for the forges your repositories are hosted on. For github.com, the GitHub CLI's login is used if this is unset.

Codex's models are read from the list Codex keeps in `~/.codex` (or `CODEX_HOME`).

## Connect an external agent

In **Settings → Agent access**, select a repository, enter the agent's name, and create a token.
Configure an HTTP MCP server in your client with the URL shown in Settings and the header
`Authorization: Bearer <token>`. The desktop URL is `http://127.0.0.1:7717/mcp`.
Copy the token before closing Settings. Use **Revoke** to end its access.

Call `list_workspaces` to find a workspace, then `read_workspace` with its `workspace_id`.
Use the same ID as `agent_id` for `workspace_status` and `send_message`. A message starts
an idle agent. A busy agent receives it after its turn, or immediately with `interrupt: true`.
