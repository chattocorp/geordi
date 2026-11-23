# @geordi/daemon

Runs on the machine with your code: worktrees, agent sessions and terminals. See
[Self-hosting](../../docs/self-hosting.md) for its settings.

## Live ACP session checks

These start a real agent session against your provider account: sign in to the provider
first. Each command starts a detached production session host with the installed OpenCode CLI or a pinned wrapper,
in a fresh temporary workspace, and exits with an error if the expected behaviour is
missing or two minutes pass.

```sh
pnpm --filter @geordi/daemon acp:probe opencode inspect
pnpm --filter @geordi/daemon acp:probe <codex|claude> <scenario>
```

- `inspect`: the session opens and completes a short prompt.
- `steer`: reconnects while a foreground command runs; its output and a steering message
  both reach the original turn.
- `background`: the foreground turn ends while a command still runs; after reconnecting,
  a second turn brings the command's output.
- `ask`: reconnects while a question is open, answers it twice with the same token, and
  checks for one question, one copy of the token in the reply, and one completed turn.
  This covers host and wrapper, not the forge's event store or the UI.
