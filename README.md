# Geordi

A self-hostable code forge and agent orchestrator. Geordi is in early development.

## Features

- 🌳 **Workspaces.** One conversation with one agent, in its own Git worktree on its own
  branch. Run as many side by side as you like.
- 🤖 **Claude and Codex.** Pick the agent, its model and how hard it thinks, per workspace.
- 💬 **Talk while it works.** Steer an agent mid-turn or queue your next message. Agents
  can ask you questions, too.
- 🧑‍🤝‍🧑 **Agents with helpers.** Agents can start and supervise other agents.
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

## Install

Download the desktop app for macOS (Apple silicon) or Windows from the
[latest release](https://github.com/chattocorp/geordi/releases/latest). On macOS, open the
disk image and drag Geordi to Applications. On Windows, extract the ZIP and open Geordi.
The app runs everything Geordi needs and keeps its data in `~/.geordi`.

Geordi runs the agent CLIs you already use: sign in to
[Claude Code](https://docs.anthropic.com/en/docs/claude-code) or
[Codex](https://github.com/openai/codex) first. For GitHub, Geordi uses the GitHub CLI's
login.

To run Geordi without the desktop app, see [Self-hosting](docs/self-hosting.md).

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
automatically, and Codex runs in its sandbox with automatic review.

## Configuring a repository

A `.geordi.yml` at the top of a repository says what to run and where to look at it.
Workspaces get a **Run** button for it, and ports of their own:

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
