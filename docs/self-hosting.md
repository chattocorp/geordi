# Self-hosting

Geordi has two parts (see [ADR-002](adr/ADR-002-forge-and-daemon-monorepo.md)):

- The **forge** (`apps/web`), a SvelteKit app, shows repositories and workspaces. It
  stores everything as an append-only event log in SQLite
  ([ADR-001](adr/ADR-001-event-sourcing.md)).
- The **daemon** (`apps/daemon`) runs on the machine with your code. It manages worktrees,
  agents and terminals, and connects to the forge.

The desktop app starts both. Without it, the `geordi` command does the same (Node.js 24 or
newer):

```sh
npx geordi
```

It uses the desktop app's ports (7717 to 7719) and data (`~/.geordi`), so only one of them
runs at a time, and prints what forge and daemon say. Ctrl+C stops Geordi and its agents;
any other signal leaves the agents working for the next start. `PORT`, `GEORDI_DAEMON_PORT`,
`GEORDI_LIVE_PORT` and `ORIGIN` (default `http://localhost:7717`) change where it runs, and
the settings below apply to it too. It listens on 127.0.0.1 only. On a server, reach it
through an SSH tunnel, for the web and the browsers' WebSocket:

```sh
ssh -L 7717:localhost:7717 -L 7719:localhost:7719 your-server
```

To run forge and daemon yourself, from a checkout (see [Contributing](../CONTRIBUTING.md)
for the tools):

```sh
pnpm install
pnpm --filter @geordi/web build
ORIGIN=http://localhost:3000 pnpm --filter @geordi/web start
node apps/daemon/src/main.ts
```

The daemon connects when the forge starts. They authenticate each other with a shared token in the forge’s data directory. One daemon owns each session directory. If the forge restarts during a turn, start the daemon with the same session directory to resume work.

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
- `FORGES_GITHUB_TOKEN` and other [`FORGES_*`](https://forges.link/guides/environment-variables): Credentials for the forges your repositories are hosted on. For github.com, the GitHub CLI's login is used if this is unset.

Codex's models are read from the list Codex keeps in `~/.codex` (or `CODEX_HOME`).

## Connect an external agent

In **Settings → Agent access**, name the external agent, choose the repositories it may work in,
and click **Create token**. Copy the bearer token before closing Settings. It grants access to the
workspaces of those repositories only, not to repositories you add later.
Use **Revoke** to end its access.

The examples below assume the agent runs on the same Mac as the desktop app. If Settings
shows a different MCP URL, use that URL. For an agent on another machine, forward a local
port on the agent's machine to the forge's loopback HTTP port through SSH and use the forwarded URL.

After copying the token, run this in the shell where you will launch the agent:

```sh
export GEORDI_MCP_TOKEN="$(pbpaste)"
```

### Codex CLI

Register the server once, then launch Codex with `GEORDI_MCP_TOKEN` in its environment
for each session. [Codex MCP configuration](https://developers.openai.com/codex/mcp/)

```sh
codex mcp add geordi --url http://127.0.0.1:7717/mcp --bearer-token-env-var GEORDI_MCP_TOKEN
```

### Claude Code

Register the server once for your user account. This command saves the bearer header in
your Claude Code user configuration. [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)

```sh
claude mcp add --scope user --transport http geordi http://127.0.0.1:7717/mcp --header "Authorization: Bearer $GEORDI_MCP_TOKEN"
```

### Verify the connection

Start a new session and ask: “Use Geordi to list my workspaces.” For other clients, select
Streamable HTTP, enter the MCP URL, and set the `Authorization` header to `Bearer <token>`.

Call `list_workspaces` to find a workspace, then `read_workspace` with its `workspace_id`.
Use the same ID as `agent_id` for `workspace_status`, `send_message` and `wait_for_agent`. A
message starts an idle agent; a busy one receives it after its turn.

To start new work, find a repository with `list_repositories` and call `start_agent` with its
ID as `repository`. The agents a client starts are its own: it can also interrupt them
(`interrupt: true`), stop and archive them, as it cannot other agents. Questions an agent asks
are for you to answer in Geordi.
