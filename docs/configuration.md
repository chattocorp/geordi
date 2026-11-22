# Configuring a repository

A repository says what to run and where to look at it in a `.geordi.yml` at its top level.
Geordi reads the workspace's own file, or else the one on the branch the work starts from.

```yaml
setup: pnpm install

tasks:
  db:
    command: docker compose up db
    ports: [postgres]
  web:
    label: Development server
    command: pnpm dev --port $PORT_HTTP
    ports: [http, hmr]
    needs: [db]
    urls:
      app: { label: App, url: 'http://localhost:{http}/' }
      admin: { label: Admin, url: 'http://localhost:{http}/admin' }
    default: true
  docs:
    url: http://localhost:8080/
```

Commands run only once you have seen and agreed to them, once per repository and again
whenever they change.

## Tasks

Give each entry in `tasks` a `command`, links, or both. The Tasks panel shows one row per
task: the default ones first, then the rest, each in file order. A task's only link sits at the end of its row; several are listed
under it.

- **Running.** Select a task to start what it needs, then its command, and to open its
  first link once that answers. Select one of its links to open that one instead. Select it
  again to run it again once it ended. Once a command has run, the terminal icon at the
  end of its row shows its output; while it runs, a stop button shows beside it. If the browser blocks the tab, select the ready link in Tasks.
- **`ports`** names the ports a command listens on: `ports: [http, live]`. A task without
  `ports` gets none. It counts as up once something listens on all of them, or as soon as
  it starts if it has none.
- **`url`** is one link, **`urls`** several, each under a name with a `url` and an
  optional `label`. In a URL, `{http}` is one of the task's own ports and `{web.http}` one
  of the task `web`'s, which then has to be up first too. Only addresses on this machine
  (`localhost`). A task with links but no command and no `needs` just opens them.
- **`needs`** names tasks that must be up first. Stopping one stops the tasks that need it.
- **`default: true`** marks the tasks to run together with ⌥⌘R on macOS or Ctrl+Alt+R
  elsewhere; the shortcut shows beside them. Shared dependencies start once, and running
  commands are reused. With no defaults, the shortcut shows the Tasks panel.
- **`label`** is a display name. Dependencies and ports use the task key.

`run`, `jobs`, `urls`, `default` and `ports` at the top level, and a `.geordi.toml`, are
no longer read: Geordi says so in the Tasks panel. Move what they said into `tasks`.

## Ports

Every workspace gets ports of its own, which never change for as long as it lives, so
that several workspaces can run side by side. Never hard-code a port.

- A task's command gets its ports as `PORT_<NAME>` (`PORT_HTTP`), and the first also as
  `PORT`.
- Every task's ports are in `GEORDI_PORT_<TASK>_<PORT>` (upper case, dashes as
  underscores), and its first also in `GEORDI_PORT_<TASK>`, for all tasks, terminals and
  agents of the workspace.
- Every workspace also has 10 spare ports, for anything an agent or a terminal starts:
  `GEORDI_PORT` is the first, `GEORDI_PORTS` how many there are.

## Setting up and tearing down

**`setup`**: a command that gets a new workspace ready: installing dependencies, copying
an `.env`, setting up a database. It runs once, when the worktree is made from the main
line, in a terminal you can watch. The agent's first turn waits for it, and is told if it
fails.

```yaml
setup: pnpm install && cp ../.env .env
```

**`teardown`**: a command that cleans up when you archive a workspace, before its
directory is removed: stopping services, dropping databases. It gets the same ports as
everything in the workspace did, and has two minutes.

```yaml
teardown: docker compose down --volumes
```
