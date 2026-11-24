# FDR-006: Repository configuration: tasks, ports, setup and teardown

**Status:** Active
**Last reviewed:** 2026-11-23

## Overview

A repository can tell Geordi how it wants to be treated, in a `.geordi.yml` at its top level: what to run to see or use the project (a dev server, a database, a desktop app, a game), where to look at it, and how to get a new workspace ready and clean up after one. Every workspace then has buttons to start and stop those things and to open what they serve, on ports that are the workspace's own, so that many workspaces of one project can run side by side.

## Behavior

### The file

- `.geordi.yml` is YAML. Settings Geordi doesn't know are ignored. The earlier settings (`run`, `jobs`, `urls`, a top-level `default` and `ports`) and a `.geordi.toml` are no longer read: a workspace that has them is told so, and what to say instead.
- `tasks:` names what a workspace runs or opens, each under its name, in the order the Tasks tab shows them. A task has a `command`, a `url`, or both, and may have a `label` (shown instead of its key; dependencies, ports, approvals and terminals keep the key), `needs` and `default: true`. Labels that begin alike with `/` (`Sorties / Ring 1`) make a task group in the Tasks tab, which folds (per browser) and stands where its first task would; each task in it is named by the rest of its label (`Ring 1`). The default tasks stay first, under their full labels.
- `ports:` names the ports a task's command listens on: `ports: [http, live]`, as many as it needs. A task without `ports` gets none.
- `url:` is where to look at a task, on this machine (`localhost`). In a URL, `{http}` is the port named `http`, as in `GEORDI_PORT_HTTP`, and the task with the URL needs the one that lists it. More places to look are tasks of their own, each with its `url`.
- `sections:` names the repository's parts, in order: each a `path` (a directory) with a `title`. The Changes tab groups a workspace's changed files under those titles when they touch two or more of them; see "Repository sections" below.
- `setup: …` names a command that gets a new workspace ready (install dependencies, copy an `.env`, create a database); `teardown: …` one that cleans up after it (stop services, drop databases). No task can be called `setup` or `teardown`.
- Which file applies to a workspace: the one in the workspace's own worktree if there is one, otherwise the one on the branch work starts from (the upstream's main branch, or the repository's checkout where there is no upstream). They are not merged. So a change to the file can be tried out in a workspace before it is merged, and a workspace that branched off before the file existed gets it all the same.
- It is read afresh whenever the workspace's files or the repository's branches change: editing the file, or fetching a main branch that changed it, shows at once.
- A workspace's file that can't be made sense of shows a quiet warning with the reason, where the tasks would be. It does not fall back to the main branch's file.

### Repository sections

- A file belongs to the section with the longest path that holds it, so sections may lie within others (`apps/web` and `apps/web/src/lib/server`). Files in none are listed last, under Other.
- Sections show only where the changes touch two or more of them (Other counts); otherwise the tab looks as it does without them.
- Each section shows its title and folds shut; folded, it says how many files it has and, where its files say theirs, the lines added and removed in all of them; what is folded (sections and directories) is remembered for each workspace in this browser. Within it, the files are a list or a tree, as the tab is set to.
- Paths are directories from the top of the repository, without `..`; a section's title is one line of up to 100 characters. A path named twice is a problem with the file.
- A section is shown with a picture of its own, as a repository is in the sidebar: the one its `icon` names (a PNG, JPEG, WebP, GIF or SVG in the repository), else the favicon, icon or logo nearest its directory among the workspace's tracked files (the daemon finds it, by the names it looks for a repository's, of which a `.geordi.svg`, `.geordi.png` or `.geordi.ico` put there for Geordi comes first; such a file stands only for the directory it is in, so a section's is not the repository's; never an `.ico`, which can't be shown as a picture of the worktree). It gives way to the chevron on hover; a section without one, or whose picture can't be shown, has the chevron.

### Ports

- Port names are the workspace's, and each belongs to one task: two processes can't listen on one port, so a name listed twice is refused. They are separate from task names; naming a server's main port after its task is usual, and nothing more than that. Each named port is the workspace's for as long as it lives: across restarts of its tasks, of the daemon and of the machine. It is kept under its name, and keeps its number when ports or tasks are added, removed or reordered; a port takes the number it had under its task (`task.port`, or the task's name when each task had one port). Ports are given up when the workspace is archived.
- Every workspace also has ten spare ports, a run of their own, for anything an agent or a terminal starts.
- The daemon picks ports that are free at that moment, on all of the machine's local addresses (`127.0.0.1`, `0.0.0.0`, `::1`, `::`): on macOS a port that can be had on one of them may be another program's on another. A workspace that needs more ports keeps what it has and gets more.
- Ports come from 20000–29999, unless the daemon's environment names other ones (`GEORDI_PORT_RANGE=30000-39999`). Two daemons on one machine know nothing of each other's ports, so each needs a range of its own: Geordi run for development (`scripts/workspace-dev.mjs`) uses 30000–39999.
- A task's command gets its first port as `PORT`. Everything in the workspace (tasks, terminals, and the agent) gets every named port as `GEORDI_PORT_<NAME>`, and the spare ones as `GEORDI_PORT` (the first) and `GEORDI_PORTS` (how many). Agents are told to use these, never a default port.

### Running

- The **Tasks** tab in the dock lists the tasks one row each: the default tasks first, then the rest, each in file order. The URL of a task that runs something sits at the end of its row. A row's mark says how its task is: a quiet dot while stopped (it turns into what the row does where one points at it), then starting, running (a gold play mark where it listens on ports and is ready to look at, the turning arrows of something under way, in gold, where it has none and simply works), ended (with its status), so that what runs stands out. Running a task starts what it needs, then its command, and opens its URL once that answers. A task with only a URL that needs nothing just opens it. A URL's icon is gold while what it needs runs: it opens at once.
- Pointing at a task highlights the tasks it needs, and what those need in turn, as the sidebar does with a workspace's parent. Selecting a task's row runs it, also again once it ended (one that runs is reused). At rest a row is its mark, its name and its only link; pointing at it (or focusing it) adds its terminal, running or from the last run, and a stop button while it runs, taking no room until then. A middle click on a task goes to its terminal: one that has not run yet starts first. Its ports show when you point at the row.
- The keyboard shortcut ⌥⌘R (Ctrl+Alt+R elsewhere) runs every `default` task together, and shows beside each. Shared dependencies start once; running commands are reused. With no default tasks, it shows the Tasks tab. Only the tasks run open browser tabs; a timeout says which port did not answer.
- Each command runs in the user's shell in the workspace directory. Starting one leaves the current pane in place. Closing a task's terminal tab hides its output; the task keeps running, and its row shows the same terminal again.
- If one of a task's ports is busy, a dialog names the task, port and identified listener. You can cancel or stop the displayed process and retry. Geordi checks the listener again before sending a termination request and waits for the port to become free. When it cannot identify the listener, you can free the port yourself and retry.
- Running a task first runs the tasks it needs, each once the ones before it are up. A task is up when something listens on all of its ports, or as soon as it has started if it has none. One whose ports never answer (it listens elsewhere, or late) is taken to be up after half a minute, if it still runs.
- Stopping a task also stops the tasks that need it.
- When a command ends by itself, its tab says with what status and stays until Enter is pressed, so that what it printed can be read.

### Setting up and tearing down

- The setup script runs once, by itself, when the daemon makes a workspace's worktree fresh from where work in the repository starts, in the workspace's directory, with its ports. It runs in a terminal tab named `setup`, which shows up in the dock by itself. Continuing a workspace, or an agent working in another's worktree, makes no new directory and runs nothing. A worktree that starts from another branch (one an agent or a person named as its base, as like as not an agent's) or is brought back from the workspace's branch gets no setup by itself: its tab says so, and its agent is told to do what it needs itself.
- The setup tab closes automatically when the script succeeds, including after a manual retry. If setup fails, the tab stays open so the person can read its output.
- The agent's first turn waits for it. Stopping the agent meanwhile ends that turn; the setup goes on, and the next turn waits for it in turn.
- However the setup ends, the agent then starts. If it failed, the agent is told so with its first message, with the end of what the script printed; if it was stopped (its tab closed), or nobody has agreed to it yet, the agent is told that too. A failed setup is the agent's to fix, or the person's: it does not stop the work.
- A setup nobody has agreed to does not run: its tab says so, and where to run it. Until it is agreed to, the workspace says so in a quiet line under its title, with **Review**, which shows the script and asks, and runs it once agreed; after that it runs by itself and nothing more is said. The Tasks tab does not list the setup and teardown scripts. A setup that did not run can be run from its own terminal: a key press in a terminal that has ended starts it again.
- The teardown script runs when a person archives a workspace (with it, the workspaces its agent started), once it is clear that its worktree goes (it has no uncommitted work, or the person agreed to lose it), and before the worktree is removed: in the workspace's directory, with its ports, in a terminal tab named `teardown`. It has two minutes. Then, however it ended, the worktree is removed. An agent archiving an agent it started removes the worktree without a teardown.
- A teardown runs only if a person has agreed to it. It has no moment of its own to be asked at, so it is asked about together with the first command a person agrees to run in the workspace: a task's, or the setup.

### Agreeing to commands

- Commands are shown in full and have to be agreed to before they first run: once per command and repository, all that an action would run in one question. The daemon remembers what was agreed to and runs no task's command without it. A changed command is a new one.
- What runs is exactly the command the person saw. If the file says something else by then, nothing of it runs, and the terminal says to start the task again.
- The setup and teardown scripts run without anyone clicking at that moment, so they run only if the file says a command a person has agreed to for that repository, and run exactly that.

### Agents

- Agents are pointed to two tools of the agent API: `configuration_reference` explains the file, and `check_configuration` reads the workspace's file the way Geordi does and says what it found, or what is wrong.

## Design Decisions

### 1. A file in the repository

**Decision:** Configuration lives in the repository, as a file, rather than in Geordi's settings.
**Why:** How a project is run belongs to the project: it should travel with it, be reviewed with it, and be the same for everyone and for every agent. It also needs no place of its own in Geordi.
**Tradeoff:** Nothing can be configured for a repository one can't commit to, and personal variations need a change in the workspace.

### 2. The workspace's file wins, whole

**Decision:** If the workspace has the file, only that file counts; the main branch's is used only where the workspace has none.
**Why:** One file to look at to know what applies. Merging would make "remove this task" impossible to express in a workspace.
**Tradeoff:** A workspace with an old copy of the file doesn't pick up what was added on the main branch since, until it is brought up to date.

### 3. Ports are written down, by the daemon

**Decision:** The daemon assigns a workspace its ports and each task's port its own among them, writes that down (`~/.geordi/ports.json`), and never works it out again.
**Why:** A port that changes breaks everything that remembered it: a bookmark, a callback address registered elsewhere, a tab left open, an agent's notes. Working ports out from something (a hash of the ID, a position in the file) changes them as soon as that something does. Ports belong to the machine, so the daemon keeps them, also once there are daemons on several machines.
**Tradeoff:** A port that was free when the run was picked can be taken by something else later. The task then fails to start, and says so, rather than moving quietly: the daemon looks before it starts a task, since what answers on a taken port would otherwise be taken for the task being up.

### 4. Up means listening, on every port it names

**Decision:** A task counts as up once something listens on all of its ports, and at once if it names none; what needs it starts then. There is nothing to configure about that.
**Why:** It is what "the server is up" means for nearly everything a project runs, and it needs no health check written per task. A task that names no ports (a script, a desktop app, a game) has nothing to wait for.
**Tradeoff:** A task that doesn't listen on the ports it names holds up what needs it for half a minute; one that listens before it can serve is taken to be up a little early. A task without ports that something needs gives it no time at all.

### 5. Only a person's word makes a command fine to run

**Decision:** A task's request carries its command as the person saw it, and the daemon runs it only if the file still says exactly that and a person has agreed to that command for that repository. What was agreed to is kept by the daemon, in a file of its own (`~/.geordi/run-approvals.json`).
**Why:** The file is the agent's to write, at any moment, and the command runs as the person, in their own shell. An agent in a sandbox must not get out of it through a button, nor swap the command between the look and the click. Nothing in the repository can vouch for a command either: its branches, too, are the agent's to move.
**Tradeoff:** The first run in a repository, and the first after every change to a command, costs one more click. And it only holds against an agent that can't reach the forge: Geordi has no authentication yet, so an agent with network access can ask the forge for anything a person can (see the README).

### 6. The daemon reads the file; the forge says what to start when

**Decision:** The daemon reads and parses the file, and sends what it says with the rest of what it knows of a worktree (ADR-003). The forge works out the order to start tasks in and waits for each to be up; the commands themselves are terminals in the daemon.
**Why:** The file is on the daemon's machine, and changes with the files the daemon already watches. Commands as terminals print, take Ctrl+C, survive a restart of the forge, and needed nothing new to run in.
**Tradeoff:** Like all terminals, commands end when the daemon does. A forge that restarts while tasks are being started leaves the ones after the restart unstarted.

### 7. Setup and teardown are settings of their own, and run by themselves

**Decision:** `setup` and `teardown` are top-level commands, not tasks with a flag. The daemon runs the setup when it makes a worktree and the teardown when it removes one, without asking the forge; both in terminals like a task's.
**Why:** They run at moments of a workspace's life rather than when someone asks, once, to the end, and need no port or `needs`: little of what a task is. Making the worktree and removing it are the daemon's, so it is the daemon that knows the moment, also while the forge is away (ADR-003): a forge restarting mid-setup finds the setup's terminal running and the turn waiting, as with any turn.
**Tradeoff:** A daemon that restarts mid-setup ends it (terminals end with the daemon); the waiting turn is reported lost, and the setup is not run again by itself: **Set up** does that.

### 8. The first turn waits for setup, and goes ahead however it went

**Decision:** The agent starts once the setup has ended, and is told if it failed, with the end of its output, or if it didn't run.
**Why:** An agent that starts before its dependencies are installed fails at the first test it runs, and guesses why. One that is told what went wrong can usually fix it, or install what it needs itself; stopping the work for a person would hold up every agent an agent starts.
**Tradeoff:** A slow setup holds up the first turn by as long as it takes. A broken one costs the agent a little of its turn.

### 9. The workspace's file, as for everything else, and only what was agreed to

**Decision:** Setup and teardown come from the file that applies to the workspace (design decision 2), like tasks, and run only as commands a person agreed to for the repository.
**Why:** One rule for which file applies. When a worktree is made, its file is the one on the branch it starts from anyway, unless an agent started it from a branch of its own; and what an agent can write to the file is held in check by approval, as for tasks (design decision 5), not by which file is read.
**Tradeoff:** An agent can change its workspace's teardown to a command nobody agreed to, and so keep it from running. It cannot make anything run that nobody agreed to.

### 10. Unasked, only on the person's work

**Decision:** Setup runs by itself only in a directory made fresh from where work in the repository starts; teardown only when a person archives.
**Why:** What a command runs is the directory's as much as the command's: `pnpm install` runs the package's scripts, `make clean` the Makefile. A task runs that too, but only when a person clicks. Setup and teardown run with nobody clicking, so where an agent wrote the directory (an agent's own branch, a worktree brought back from the workspace's branch) or asked for the archiving, they would run the agent's code outside its sandbox at the agent's word. There, installing is the agent's to do, in its sandbox.
**Tradeoff:** Agents that agents start set themselves up, more slowly, and the worktrees agents archive are not cleaned up after (stopped services, dropped databases). Approval is still of a command, whatever slot of the file it is in. And "fresh from the main line" is read from the repository's refs, which an agent that can write the repository's Git directory can move (where there is an upstream, a fetch puts its branches back first): like design decision 5, this holds against an agent's mistakes, not against one set on getting out.

### 11. Archiving does not wait for a teardown that fails

**Decision:** A teardown that fails, hangs past two minutes, or was never agreed to doesn't keep the worktree: archiving goes on.
**Why:** Archiving is how a person is done with a workspace; a broken script must not make that impossible. What a failed teardown leaves behind (a container, a database) is less harm than a workspace that can't be put away.
**Tradeoff:** Whatever the teardown should have cleaned up stays, and only the daemon's log says so.

## Out of Scope

- Starting tasks by themselves, or on the agent's behalf.
- Asking the person about a setup when a workspace is made, or showing a teardown's outcome after archiving.
- Health checks beyond "listens on its port".
- Previews inside Geordi: links open in the browser.
- Links to anywhere but this machine.
- The combined diff in repository sections (not yet).

### 12. YAML, and tasks only

**Decision:** The file is YAML (`.geordi.yml`), and says what to run under `tasks`. The earlier settings (`run`, `jobs`, `urls`, `default`, `ports`) and the TOML file are no longer read; a workspace that still has them is told so, with what to say instead.
**Why:** One way to say a thing. Two ways meant two parsers, two layouts of the Tasks tab and two sets of rules for agents to learn; the old ones could say neither several ports for one command, nor none.
**Tradeoff:** A repository with the old settings has nothing to run until its file is rewritten. Its ports carry over: a task's first port takes the one the task had.

### 13. A tab, not a button and a menu

**Decision:** What a workspace runs is shown in a tab of its own in the dock, with every task and how each is, instead of a Run button with a menu beside the dock's tabs.
**Why:** A menu shows how things are only while it is open, and a button says one thing at a time. What runs is ongoing state, worth seeing at a glance, next to the terminals it runs in; and the tab bar stays for tabs.
**Tradeoff:** Running a task with the mouse takes two clicks when another tab is selected. The keyboard shortcut works from anywhere in the workspace.

### 14. Ports are named, the workspace's, and a workspace has spare ones besides

**Decision:** Each task names the ports its command listens on, none or several. The names are the workspace's, each one task's, and a URL says a port by its name (`{http}`). Every workspace gets ten spare ports of its own on top. There is no count of ports to set.
**Why:** A process does not have one port: a dev server has its pages and a WebSocket, a desktop app three, a script none. Naming them lets a link say which one it means, lets "up" mean all of them, and keeps the ports of a task apart from those an agent picks for something of its own. A fixed number of spare ones is one thing less to decide. Names that are the workspace's keep a URL and the variables short (`{http}`, `GEORDI_PORT_HTTP`).
**Tradeoff:** Ten ports a workspace that never uses them, and a task that listens on a port it doesn't name is not waited for. Every port needs a name of its own across the file.

### 15. One URL per task

**Decision:** A task has at most one `url`. Another place to look is a task of its own, whose URL uses the port of the task it looks at (and so needs it).
**Why:** One way to write a link, and one kind of row in the Tasks tab. A link of its own gets a label, a `default` and a row like any task, with nothing new to learn.
**Tradeoff:** The links of one server are rows of their own, not grouped under it.

### 16. Task groups come from the labels

**Decision:** Tasks whose labels begin alike with `/` (`Sorties / Ring 1`) are a group in the Tasks tab, which folds. There is no `group` setting and no nesting of tasks.
**Why:** A long list needs groups, a short one nothing new: a simple file stays as it is, and a long one says what belongs together where it names it. One more setting, or tasks under a group's key, would ask that of every file.
**Tradeoff:** A label with `/` in it for another reason makes a group; a task is in one group at most.

### 17. Repository sections are a list of directories, matched by the longest path

**Decision:** `sections` is an ordered list of `path` and `title`, matched as directory prefixes; the longest wins. No globs. The key is at the top of the file, like every other setting.
**Why:** The order is the order people want to read the parts in, which a table keyed by path would not keep reliably. Directories are how repositories are already divided, and longest-match lets a section be carved out of another without exclusions. The whole file is about the repository, so a `repo:` block would set nothing apart. It starts simple; agents are to get the sections as context later.
**Tradeoff:** Files spread by pattern (`*.spec.ts` everywhere) can't be a section.
