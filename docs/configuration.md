# Configuring a repository

A repository says what to run and where to look at it in a `.geordi.yml` at its top level.
Geordi reads the workspace's own file, or else the one on the branch the work starts from.

Three ideas are all there is to it:

- **Tasks** run something (`command`), open something (`url`), or both. `needs` says which
  other tasks have to be up first.
- **Ports** are names the workspace keeps a number for, as long as it lives. A task lists
  the ones its command listens on; a URL uses one by its name (`{web}`), and everything in
  the workspace finds it as `GEORDI_PORT_WEB`.
- **Up** means every port a task lists answers, or that it has started, if it lists none.
  What needs a task waits for that.

```yaml
setup: pnpm install

tasks:
  db:
    command: docker compose up db
    ports: [postgres]
  web:
    label: Development server
    command: pnpm dev --port $PORT
    ports: [http, hmr]
    needs: [db]
    url: http://localhost:{http}/
    default: true
  admin:
    label: Admin area
    url: http://localhost:{http}/admin
  docs:
    url: http://localhost:8080/
```

Commands run only once you have seen and agreed to them, once per repository and again
whenever they change.

## Tasks

Give each entry in `tasks` a `command`, a `url`, or both. The Tasks panel shows one row
per task: the default ones first, then the rest, each in file order.

- **Running.** Select a task to start what it needs, then its command, and to open its
  `url` once that answers. Select it again to run it again once it ended. Point at a task
  that has run to show its terminal (or middle-click any task to go to its terminal,
  starting it first if it hasn't run); while it runs, a stop button shows beside it. If
  the browser blocks the tab, select the ready link in Tasks.
- **`ports`** names the ports a command listens on: `ports: [http, live]`. Names are the
  workspace's, and each belongs to one task. A task without `ports`
  gets none. It counts as up once something listens on all of them, or as soon as
  it starts if it has none.
- **`url`** is where to look at a task, on this machine (`localhost`). In a URL, `{http}`
  is the port named `http`, and the task that lists it has to be up first too. For more places to look, give each a task
  of its own, as `admin` above. A task with only a `url` that needs nothing just opens it.
- **`needs`** names tasks that must be up first. Stopping one stops the tasks that need it.
- **`default: true`** marks the tasks that ⌥⌘R on macOS (Ctrl+Alt+R elsewhere) runs or
  opens; the shortcut shows beside them. Shared dependencies start once, and running
  commands are reused. With no defaults, the shortcut shows the Tasks panel.
- **`label`** is a display name. Dependencies and ports use the task key.

`run`, `jobs`, `urls`, `default` and `ports` at the top level, `urls` in a task, and a
`.geordi.toml` are no longer read: Geordi says so in the Tasks panel.

## Ports

Every workspace gets ports of its own, which never change for as long as it lives, so
that several workspaces can run side by side. Never hard-code a port.

- Port names are the workspace's: each name belongs to one task, and two tasks can't list
  the same one. They are separate from task names; naming a server's main port after its
  task (the task `web` listening on `web`) is usual.
- Every named port is in `GEORDI_PORT_<NAME>` (`GEORDI_PORT_HTTP`; upper case, dashes as
  underscores), for all tasks, terminals and agents of the workspace.
- A task's own command also gets its first port as `PORT`.
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
