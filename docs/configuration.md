# Configuring a repository

A repository says what to run and where to look at it in a `.geordi.yml` at its top level.
Geordi reads the workspace's own file, or else the one on the branch the work starts from.
(A `.geordi.toml` saying the same in TOML is still read where there is no `.geordi.yml`.)

```yaml
setup: pnpm install

tasks:
  db:
    command: docker compose up db
  web:
    label: Development server
    command: pnpm dev --port $PORT
    needs: [db]
    url: http://localhost:$PORT/
    default: true
```

Commands run only once you have seen and agreed to them, once per repository and again
whenever they change.

## Running

Give each entry in `tasks` a `command`, a local HTTP or HTTPS `url`, or both.
The Tasks panel shows one row per task, in file order. Select a task with a URL to
start what it needs and open the page when its port accepts connections. If the
browser blocks the tab, select the ready link in Tasks. For a command-only task,
select its name to start it or to read its terminal once it has run. The control
beside the name lets you stop a running command or run it again after it ends.

- Use `needs` to name tasks that must be ready first. A task's URL can use `$PORT` for
  its own command's port, and `{web}` for the port of the command named `web`, which it
  then also starts when needed.
- Set `default: true` on each task you want to launch together. The shortcut appears beside
  each default task. Press ⌥⌘R on macOS or Ctrl+Alt+R elsewhere. Shared dependencies start
  once. Geordi opens the URLs of the selected tasks and reuses running commands.
  With no defaults, the shortcut shows the Tasks panel.
- Use `label` for a display name. Dependencies and assigned ports use the task key.

### Existing job and URL configurations

Repositories can continue to use the following settings together. When migrating,
replace them with `tasks` and keep command keys to retain assigned ports.

**`run`**: for a project with one thing to run, this is enough:

```yaml
run: pnpm dev --port $PORT
```

It is short for a single job called `run`.

**`jobs`**: several things to run, each a `command` under a name (lower case letters,
digits and dashes). Each job runs in a terminal of its own, in the workspace's directory,
and should keep running until stopped.

- `needs` lists the jobs that have to be up first. Starting a job starts those; stopping
  one stops the jobs that need it.
- `label` is an optional display name (1–100 characters). Without one, Geordi shows the
  key. Dependencies, URL placeholders and port variables always use the key.

**`urls`**: places to open in the browser, each a `url` under a name, with an optional
`label`. `{web}` stands for the port of the job `web`. Opening a URL first starts the jobs
it mentions (and any under its `needs`) and waits for them. Only addresses on this
machine (`localhost`).

**`default`** selects the first action inside the **Tasks** tab. Use a URL key such as
`urls.app` or a job key such as `jobs.web`. Press ⌥⌘R on macOS or Ctrl+Alt+R elsewhere
to use it from the workspace. If you omit `default`, Geordi uses the job named `run`
when present. Otherwise the pane lists the configured links and jobs in their usual order.

## Ports

Every workspace gets ports of its own, which never change for as long as it lives, so
that several workspaces can run side by side. Never hard-code a port.

- A job gets its port as `PORT`.
- Every job's port is in `GEORDI_PORT_<NAME>` (upper case, dashes as underscores), for
  all jobs, terminals and agents of the workspace.
- `GEORDI_PORT` is the workspace's first port, `GEORDI_PORTS` how many there are, and
  `GEORDI_ASSIGNED_PORTS` a JSON array of all of them. Use the array for spare ports:
  they need not be contiguous.

**`ports`**: how many ports each workspace gets. By default one per job, or 10 where
there are no jobs. Only needed for spare ones:

```yaml
ports: 20
```

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
