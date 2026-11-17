# FDR-006: Repository configuration: jobs, ports, links, setup and teardown

**Status:** Active
**Last reviewed:** 2026-11-17

## Overview

A repository can tell Geordi how it wants to be treated, in a `.geordi.yml` at its top level: what to run to see or use the project (a dev server, a database, a desktop app, a game), where to look at it, and how to get a new workspace ready and clean up after one. Every workspace then has buttons to start and stop those things and to open what they serve, on ports that are the workspace's own, so that many workspaces of one project can run side by side.

## Behavior

### The file

- `.geordi.yml` is YAML. Settings Geordi doesn't know are ignored. A `.geordi.toml` with the same settings in TOML (what the file was first) is still read where there is no `.geordi.yml`; where there is one of each, the YAML one counts.
- `run: pnpm dev` names the one command that runs the project. It is short for a single job called `run`.
- `jobs:` names several, each under its name: each has a `command`, and may list the jobs it `needs`.
- `urls:` names places to open, each under its name: each has a `url`, in which `{job}` stands for that job's port. A link needs the jobs it mentions, and any it lists under `needs`. Links only lead to this machine (`localhost`).
- Jobs and links may have an optional human-readable `label`, shown in Run/Open controls and command reviews. Without a label, the key is shown. Labels do not change dependencies, assigned ports, command approvals or terminal identities. This lets repositories use readable names without breaking references.
- `setup: …` names a command that gets a new workspace ready (install dependencies, copy an `.env`, create a database); `teardown: …` one that cleans up after it (stop services, drop databases). No job can be called `setup` or `teardown`.
- A workspace gets one port per job. `ports: 20` asks for that many instead, for spare ones. (Where a repository names no jobs, a workspace gets ten.)
- Which file applies to a workspace: the one in the workspace's own worktree if there is one, otherwise the one on the branch work starts from (the upstream's main branch, or the repository's checkout where there is no upstream). They are not merged. So a change to the file can be tried out in a workspace before it is merged, and a workspace that branched off before the file existed gets it all the same.
- It is read afresh whenever the workspace's files or the repository's branches change: editing the file, or fetching a main branch that changed it, shows at once.
- A workspace's file that can't be made sense of shows a quiet warning with the reason, where the buttons would be. It does not fall back to the main branch's file.

### Ports

- A workspace gets a run of ports of its own (one per job, unless the file asks for more) the first time it needs one. The daemon picks a run in which every port is free at that moment, and otherwise looks further.
- Those ports are the workspace's for as long as it lives: across restarts of its jobs, of the daemon and of the machine. They are given up when the workspace is archived.
- Every job has one of them as its own, from the first time the job is seen. It keeps it when jobs are added, removed or reordered.
- A workspace that outgrows its ports (more jobs, or a bigger `ports`) keeps what it has and gets more.
- A job's command gets its port as `PORT`. Everything in the workspace (jobs, terminals, and the agent) gets every job's port as `GEORDI_PORT_<NAME>`, the first of the workspace's ports as `GEORDI_PORT`, and their number as `GEORDI_PORTS`. Agents are told to use these, never a default port.

### Running

- The bar of the workspace's dock (where its terminals are) has the controls at its end. With one job and no links, it is a **Run** button that says what it would run, and is **Stop** while it runs. Otherwise there are two menus: **Run**, with every job to start or stop and "Start all" / "Stop all", and **Open**, with every link.
- Each job runs in a terminal tab named after it, in the user's shell, in the workspace's directory.
- Starting a job first starts the jobs it needs, each once the ones before it are up. A job is up when something listens on its port. One that never does (a desktop app, a game) is taken to be up after half a minute, if it still runs.
- Stopping a job stops the jobs that need it too. Closing a job's tab is stopping it.
- Opening a link starts the jobs it needs, waits for them to be up, and opens it in the browser.
- When a job's command ends by itself, its tab says with what status and stays until Enter is pressed, so that what it printed can be read.

### Setting up and tearing down

- The setup script runs once, by itself, when the daemon makes a workspace's worktree fresh from where work in the repository starts, in the workspace's directory, with its ports. It runs in a terminal tab named `setup`, which shows up in the dock by itself. Continuing a workspace, or an agent working in another's worktree, makes no new directory and runs nothing. A worktree that starts from an agent's branch (one an agent started with a worktree of its own) or is brought back from the workspace's branch gets no setup by itself: its tab says so, and its agent is told to do what it needs itself.
- The agent's first turn waits for it. Stopping the agent meanwhile ends that turn; the setup goes on, and the next turn waits for it in turn.
- However the setup ends, the agent then starts. If it failed, the agent is told so with its first message, with the end of what the script printed; if it was stopped (its tab closed), or nobody has agreed to it yet, the agent is told that too. A failed setup is the agent's to fix, or the person's: it does not stop the work.
- A setup nobody has agreed to does not run: its tab says so, and where to run it. Until it is agreed to, the workspace says so in a quiet line under its title, with **Review**, which shows the script and asks, and runs it once agreed; after that it runs by itself and nothing more is said. The Run menu lists jobs only. A setup that did not run can be run from its own terminal: a key press in a terminal that has ended starts it again.
- The teardown script runs when a person archives a workspace (with it, the workspaces its agent started), once it is clear that its worktree goes (it has no uncommitted work, or the person agreed to lose it), and before the worktree is removed: in the workspace's directory, with its ports, in a terminal tab named `teardown`. It has two minutes. Then, however it ended, the worktree is removed. An agent archiving an agent it started removes the worktree without a teardown.
- A teardown runs only if a person has agreed to it. It has no moment of its own to be asked at, so it is asked about together with the first command a person agrees to run in the workspace: a job, or the setup.

### Agreeing to commands

- Commands are shown in full and have to be agreed to before they first run: once per command and repository, all that an action would run in one question. The daemon remembers what was agreed to and runs no job's command without it. A changed command is a new one.
- What runs is exactly the command the person saw. If the file says something else by then, nothing of it runs, and the terminal says to start the job again.
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
**Why:** One file to look at to know what applies. Merging would make "remove this job" impossible to express in a workspace.
**Tradeoff:** A workspace with an old copy of the file doesn't pick up what was added on the main branch since, until it is brought up to date.

### 3. Ports are written down, by the daemon

**Decision:** The daemon assigns a workspace its ports and each job its own among them, writes that down (`~/.geordi/ports.json`), and never works it out again.
**Why:** A port that changes breaks everything that remembered it: a bookmark, a callback address registered elsewhere, a tab left open, an agent's notes. Working ports out from something (a hash of the ID, a position in the file) changes them as soon as that something does. Ports belong to the machine, so the daemon keeps them, also once there are daemons on several machines.
**Tradeoff:** A port that was free when the run was picked can be taken by something else later. The job then fails to start, and says so, rather than moving quietly.

### 4. Up means listening

**Decision:** A job counts as up once something listens on its port; what needs it starts then. There is nothing to configure about that.
**Why:** It is what "the server is up" means for nearly everything a project runs, and it needs no health check written per job.
**Tradeoff:** A job that never listens holds up what needs it for half a minute; one that listens before it can serve is taken to be up a little early.

### 5. Only a person's word makes a command fine to run

**Decision:** A job's request carries its command as the person saw it, and the daemon runs it only if the file still says exactly that and a person has agreed to that command for that repository. What was agreed to is kept by the daemon, in a file of its own (`~/.geordi/run-approvals.json`).
**Why:** The file is the agent's to write, at any moment, and the command runs as the person, in their own shell. An agent in a sandbox must not get out of it through a button, nor swap the command between the look and the click. Nothing in the repository can vouch for a command either: its branches, too, are the agent's to move.
**Tradeoff:** The first run in a repository, and the first after every change to a command, costs one more click. And it only holds against an agent that can't reach the forge: Geordi has no authentication yet, so an agent with network access can ask the forge for anything a person can (see the README).

### 6. The daemon reads the file; the forge says what to start when

**Decision:** The daemon reads and parses the file, and sends what it says with the rest of what it knows of a worktree (ADR-003). The forge works out the order to start jobs in and waits for each to be up; the jobs themselves are terminals in the daemon.
**Why:** The file is on the daemon's machine, and changes with the files the daemon already watches. Jobs as terminals print, take Ctrl+C, survive a restart of the forge, and needed nothing new to run in.
**Tradeoff:** Like all terminals, jobs end when the daemon does. A forge that restarts while jobs are being started leaves the ones after the restart unstarted.

### 7. Setup and teardown are settings of their own, and run by themselves

**Decision:** `setup` and `teardown` are top-level commands, like `run`, not jobs with a flag. The daemon runs the setup when it makes a worktree and the teardown when it removes one, without asking the forge; both in terminals like a job's.
**Why:** They run at moments of a workspace's life rather than when someone asks, once, to the end, and need no port or `needs`: little of what a job is. Making the worktree and removing it are the daemon's, so it is the daemon that knows the moment, also while the forge is away (ADR-003): a forge restarting mid-setup finds the setup's terminal running and the turn waiting, as with any turn.
**Tradeoff:** A daemon that restarts mid-setup ends it (terminals end with the daemon); the waiting turn is reported lost, and the setup is not run again by itself: **Set up** does that.

### 8. The first turn waits for setup, and goes ahead however it went

**Decision:** The agent starts once the setup has ended, and is told if it failed, with the end of its output, or if it didn't run.
**Why:** An agent that starts before its dependencies are installed fails at the first test it runs, and guesses why. One that is told what went wrong can usually fix it, or install what it needs itself; stopping the work for a person would hold up every agent an agent starts.
**Tradeoff:** A slow setup holds up the first turn by as long as it takes. A broken one costs the agent a little of its turn.

### 9. The workspace's file, as for everything else, and only what was agreed to

**Decision:** Setup and teardown come from the file that applies to the workspace (design decision 2), like jobs, and run only as commands a person agreed to for the repository.
**Why:** One rule for which file applies. When a worktree is made, its file is the one on the branch it starts from anyway, unless an agent started it from a branch of its own; and what an agent can write to the file is held in check by approval, as for jobs (design decision 5), not by which file is read.
**Tradeoff:** An agent can change its workspace's teardown to a command nobody agreed to, and so keep it from running. It cannot make anything run that nobody agreed to.

### 10. Unasked, only on the person's work

**Decision:** Setup runs by itself only in a directory made fresh from where work in the repository starts; teardown only when a person archives.
**Why:** What a command runs is the directory's as much as the command's: `pnpm install` runs the package's scripts, `make clean` the Makefile. A job runs that too, but only when a person clicks. Setup and teardown run with nobody clicking, so where an agent wrote the directory (an agent's own branch, a worktree brought back from the workspace's branch) or asked for the archiving, they would run the agent's code outside its sandbox at the agent's word. There, installing is the agent's to do, in its sandbox.
**Tradeoff:** Agents that agents start set themselves up, more slowly, and the worktrees agents archive are not cleaned up after (stopped services, dropped databases). Approval is still of a command, whatever slot of the file it is in. And "fresh from the main line" is read from the repository's refs, which an agent that can write the repository's Git directory can move (where there is an upstream, a fetch puts its branches back first): like design decision 5, this holds against an agent's mistakes, not against one set on getting out.

### 11. Archiving does not wait for a teardown that fails

**Decision:** A teardown that fails, hangs past two minutes, or was never agreed to doesn't keep the worktree: archiving goes on.
**Why:** Archiving is how a person is done with a workspace; a broken script must not make that impossible. What a failed teardown leaves behind (a container, a database) is less harm than a workspace that can't be put away.
**Tradeoff:** Whatever the teardown should have cleaned up stays, and only the daemon's log says so.

## Out of Scope

- Starting jobs by themselves, or on the agent's behalf.
- Asking the person about a setup when a workspace is made, or showing a teardown's outcome after archiving.
- Health checks beyond "listens on its port".
- Previews inside Geordi: links open in the browser.
- Links to anywhere but this machine.

### 12. YAML, with TOML still read

**Decision:** The file is YAML (`.geordi.yml`). A `.geordi.toml` is still read where there is no `.geordi.yml`; agents are told to write YAML, and that a TOML file wants moving.
**Why:** YAML is what the projects Geordi is used on already configure things in, and what their people and agents write without looking anything up. Reading TOML on costs a few lines and breaks nobody's repository.
**Tradeoff:** Two parsers, and a file that can be there twice: the YAML one counts, and the other is silently not looked at.
