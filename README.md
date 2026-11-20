# Geordi

A self-hostable code forge and agent orchestrator. Geordi is in early development.

## Features

- 🌳 **Workspaces.** One conversation with one agent, in its own Git worktree on its own
  branch. Run as many side by side as you like.
- 🤖 **Claude Code, Codex, and OpenCode.** Pick the agent, its model and how hard it thinks, per workspace.
- 💬 **Talk while it works.** Steer an agent mid-turn or queue your next message. Agents
  can ask you questions, too.
- 🧑‍🤝‍🧑 **Control agents through MCP.** Ask your workspace agent to start other agents,
  send them instructions, and collect their replies. Geordi gives it access to these
  tools through the Model Context Protocol (MCP).
- 👀 **Live changes.** Diffs update as the agent writes.
- 🖥️ **Terminals built in.** Open shells right next to the conversation.
- 🚦 **Pull requests at a glance.** The sidebar shows how each workspace's PR and checks
  stand, and one click takes you to the next step: create the PR, fix the checks, resolve
  conflicts, merge, archive.
- ▶️ **Run your project.** Start your project's jobs from a workspace, each workspace on
  ports of its own.
- 📦 **Release notes in view.** See the change notes a workspace adds and the versions
  they lead to.
- 🔁 **Survives restarts.** Agents keep working when you quit the app.
- 🏠 **Yours.** Runs on your machine, with your data in a local SQLite file.

## Design choices

- **A calm workspace.** The conversation and diffs take priority. A small set of colors
  makes actions and status easy to recognize. Idle workspaces stay still. A moving
  indicator tells you an agent is working or a check is running.
- **Planning happens in the conversation.** Ask the agent for a plan and tell it to wait
  for feedback before editing. Geordi can show its checklist as it works. There is no
  separate plan mode.
- **Two permission modes.** Choose Auto Mode or Full Access. Geordi does not offer a
  mode that asks you to approve individual tool calls. See [Safety](#safety).
- **Use your own browser.** Project previews and external links open in your browser.
  There is no in-app browser.

## Install

Download the desktop app for macOS (Apple silicon), Windows or Linux (x64) from the
[latest release](https://github.com/chattocorp/geordi/releases/latest). On macOS, open the
disk image and drag Geordi to Applications. On Windows, extract the ZIP and open Geordi. On
Debian or Ubuntu, install the `.deb` (`sudo apt install ./Geordi-….deb`) and run `geordi`.
For a portable Linux download, make the AppImage executable (`chmod +x Geordi-*.AppImage`)
and run it, or extract the tarball and run `geordi` in it.
The app runs everything Geordi needs and keeps its data in `~/.geordi`.

On macOS, open **Settings → About** to check for updates, choose the Stable or Beta channel,
and restart to install a downloaded update. Geordi also checks on startup and hourly.

Geordi runs the agent CLIs you already use: sign in to
[Claude Code](https://docs.anthropic.com/en/docs/claude-code),
[Codex](https://github.com/openai/codex), or [OpenCode](https://opencode.ai) first.
For OpenCode, run `opencode auth login`, then select **OpenCode** in the workspace model picker.
It uses your configured model. You can also enter a model ID such as `provider/model`.
Messages sent during an OpenCode turn wait in the workspace queue. For GitHub, Geordi uses the GitHub CLI's
login.

To run Geordi without the desktop app (Node.js 24 or newer), run `npx geordi` and open
http://localhost:7717. See [Self-hosting](docs/self-hosting.md).

## Getting started

1. Register a repository on the home page.
2. Open it and start a workspace: describe the work, pick an agent, and send.
3. The agent works in its own worktree, on a new branch. Follow its changes, talk to it,
   and use the ribbon at the top to take the work to a pull request and merge it.

## Safety

> **Geordi has no authentication yet.** Anyone who can reach it can run agents on your
> machine, so it only listens on 127.0.0.1 and only answers to localhost hostnames.

Agents need to commit, push and use tools like `gh`, so by default they run with **Full
Access**: no permission prompts and no sandbox. They can do whatever your user can.
Choose **Auto Mode** in the composer to restrict them: Claude then decides permissions
automatically, and Codex runs in its sandbox with automatic review. For OpenCode, choose
**Configured permissions** to use its permission rules and decline requests that require approval.

## Configuring a repository

A `.geordi.yml` at the top of a repository says what to run and where to look at it.
Workspaces get a **Run** tab for it, and ports of their own:

```yaml
jobs:
  web:
    command: pnpm dev --port $PORT

urls:
  app:
    url: http://localhost:{web}/
```

See [Configuration](docs/configuration.md) for everything it can say.

## Learn more

- [Configuration](docs/configuration.md): the `.geordi.yml` reference
- [Connect an external agent](docs/self-hosting.md#connect-an-external-agent) with Codex CLI, Claude Code, or another HTTP MCP client.
- [Self-hosting](docs/self-hosting.md): running forge and daemon yourself, and their
  settings
- [Contributing](CONTRIBUTING.md): developing Geordi
- [Architecture decisions](docs/adr/INDEX.md) and [feature decisions](docs/fdr/INDEX.md)
- [Backlog](planning/), managed with [means](https://github.com/hmans/means)

## License

Copyright 2026 ChattoCorp GmbH. Geordi is licensed under the [Apache License, Version 2.0](LICENSE).
