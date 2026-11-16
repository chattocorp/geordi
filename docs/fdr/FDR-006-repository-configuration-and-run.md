# FDR-006: Repository configuration: jobs, ports and links

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

A repository can tell Geordi how it wants to be treated, in a `.geordi.toml` at its top level: what to run to see or use the project (a dev server, a database, a desktop app, a game), and where to look at it. Every workspace then has buttons to start and stop those things and to open what they serve, on ports that are the workspace's own, so that many workspaces of one project can run side by side.

## Behavior

### The file

- `.geordi.toml` is TOML. Settings Geordi doesn't know are ignored.
- `run = "pnpm dev"` names the one command that runs the project. It is short for a single job called `run`.
- `[jobs.<name>]` names several: each has a `command`, and may list the jobs it `needs`.
- `[urls.<name>]` names places to open: each has a `url`, in which `{job}` stands for that job's port. A link needs the jobs it mentions, and any it lists under `needs`. Links only lead to this machine (`localhost`).
- A workspace gets one port per job. `ports = 20` asks for that many instead, for spare ones. (Where a repository names no jobs, a workspace gets ten.)
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

### Agreeing to commands

- Commands are shown in full and have to be agreed to before they first run: once per command and repository, all that an action would run in one question. The daemon remembers what was agreed to and runs no job's command without it. A changed command is a new one.
- What runs is exactly the command the person saw. If the file says something else by then, nothing of it runs, and the terminal says to start the job again.

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

## Out of Scope

- Setup and teardown scripts; starting jobs by themselves, or on the agent's behalf.
- Health checks beyond "listens on its port".
- Previews inside Geordi: links open in the browser.
- Links to anywhere but this machine.
