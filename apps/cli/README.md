# geordi

[Geordi](https://github.com/chattocorp/geordi) is a self-hostable code forge and agent orchestrator. This package runs it without the desktop app:

```sh
npx geordi
```

Then open http://localhost:7717. Geordi keeps its data in `~/.geordi`, shared with the desktop app; only one of them runs at a time.

You need Node.js 24 or newer, Git, and the agents you want to use ([Claude Code](https://claude.com/claude-code), [Codex](https://github.com/openai/codex), [OpenCode](https://opencode.ai)), installed and logged in. For GitHub, Geordi uses the GitHub CLI's login.

**Geordi has no authentication yet**, so it only listens on 127.0.0.1. To use it on a server, reach it through an SSH tunnel:

```sh
ssh -L 7717:localhost:7717 -L 7719:localhost:7719 your-server
```

Ctrl+C stops Geordi and its agents. Settings come from the environment; see [Self-hosting](https://github.com/chattocorp/geordi/blob/main/docs/self-hosting.md).
