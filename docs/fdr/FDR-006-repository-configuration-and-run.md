# FDR-006: Repository configuration, and running the project

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

A repository can tell Geordi how it wants to be treated, in a `.geordi.toml` at its top level. The first thing it can say is how the project is run (its dev server, say), which gives every workspace a button to start and stop it.

## Behavior

- `.geordi.toml` is TOML. For now it has one setting: `run`, a command as a string (`run = "pnpm dev"`). Settings Geordi doesn't know are ignored.
- Which file applies to a workspace: the one in the workspace's own worktree if there is one, otherwise the one on the branch work starts from (the upstream's main branch, or the repository's checkout where there is no upstream). So a change to the file can be tried out in a workspace before it is merged, and a workspace that branched off before the file existed gets it all the same.
- It is read afresh whenever the workspace's files or the repository's branches change: editing the file, or fetching a main branch that changed it, shows at once.
- With a `run` command, the bar of the workspace's dock (where its terminals are) has a **Run** button at its end, which says what it would run. It opens a terminal tab called "Run" in the dock that runs the command, in the user's shell, in the workspace's directory. While it runs, the button is **Stop**, which ends the command and closes the tab; closing the tab does the same.
- When the command ends by itself, the tab says with what status and stays until Enter is pressed, so that what it printed can be read.
- What runs is exactly the command the person pressing Run saw. If the file says something else by then, nothing runs, and the terminal says to press Run again.
- A command is shown in full and has to be agreed to before it first runs: once per command and repository. The daemon remembers what was agreed to and runs no run command without it. A changed command is a new one.
- A workspace's file that can't be made sense of shows a quiet warning in the same place, with the reason. It does not fall back to the main branch's file.

## Design Decisions

### 1. A file in the repository

**Decision:** Configuration lives in the repository, as a file, rather than in Geordi's settings.
**Why:** How a project is run belongs to the project: it should travel with it, be reviewed with it, and be the same for everyone and for every agent. It also needs no place of its own in Geordi.
**Tradeoff:** Nothing can be configured for a repository one can't commit to, and personal variations (another port, say) need a change in the workspace.

### 2. The workspace's file wins, whole

**Decision:** If the workspace has the file, only that file counts; the main branch's is used only where the workspace has none. They are not merged.
**Why:** One file to look at to know what applies. Merging would make "remove this setting" impossible to express in a workspace.
**Tradeoff:** A workspace with an old copy of the file doesn't pick up what was added on the main branch since, until it is brought up to date.

### 3. The daemon reads it; the forge only shows it

**Decision:** The daemon reads and parses the file, and sends what it says with the rest of what it knows of a worktree (ADR-003). To run the command, the forge passes on the command the person saw; the daemon reads the file again and runs it only if it is the same.
**Why:** The file is on the daemon's machine, and changes with the files the daemon already watches. Running only what the file says leaves no way to make a daemon run something else through the forge or a browser.
**Tradeoff:** One more request per refresh of a worktree's state.

### 4. The agent can't make the person run something unseen

**Decision:** The run request carries the command as the person saw it, and the daemon runs it only if the file still says exactly that and a person has agreed to that command for that repository. What was agreed to is kept by the daemon, in a file of its own (`~/.geordi/run-approvals.json`).
**Why:** The file is the agent's to write, at any moment, and the command runs as the person, in their own shell. An agent in a sandbox must not get out of it through a button, nor swap the command between the look and the click. Nothing in the repository can vouch for a command either: its branches, too, are the agent's to move. Only the person's word counts, kept where no agent's sandbox can write.
**Tradeoff:** The first Run in a repository, and the first after every change to the command, costs one more click, also for commands that came in through a reviewed pull request.

### 5. Run is a terminal

**Decision:** The command runs in a terminal like any other (ADR-003), under a fixed name, rather than as a new kind of process.
**Why:** A dev server prints, takes Ctrl+C, and sometimes asks a question: a terminal does all of that already, survives a restart of the forge, and needed nothing new.
**Tradeoff:** Like all terminals, it ends when the daemon does. Geordi knows that the terminal is open, not whether the server in it is up.

## Out of Scope

- More than one command, setup and teardown scripts, ports and previews.
- Starting the command by itself, or on the agent's behalf.
- The agent knowing about, or using, the run command.
