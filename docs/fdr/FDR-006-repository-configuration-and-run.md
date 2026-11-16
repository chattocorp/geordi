# FDR-006: Repository configuration, and running the project

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

A repository can tell Geordi how it wants to be treated, in a `.geordi.toml` at its top level. The first thing it can say is how the project is run (its dev server, say), which gives every workspace a button to start and stop it.

## Behavior

- `.geordi.toml` is TOML. For now it has one setting: `run`, a command as a string (`run = "pnpm dev"`). Settings Geordi doesn't know are ignored.
- Which file applies to a workspace: the one in the workspace's own worktree if there is one, otherwise the one on the branch work starts from (the upstream's main branch, or the repository's checkout where there is no upstream). So a change to the file can be tried out in a workspace before it is merged, and a workspace that branched off before the file existed gets it all the same.
- It is read afresh whenever the workspace's files or the repository's branches change: editing the file, or fetching a main branch that changed it, shows at once.
- With a `run` command, the workspace's title bar has a **Run** button, which says what it would run. It opens a terminal tab called "Run" in the dock that runs the command, in the user's shell, in the workspace's directory. While it runs, the button is **Stop**, which ends the command and closes the tab; closing the tab does the same.
- When the command ends by itself, the tab says with what status and stays until Enter is pressed, so that what it printed can be read.
- What runs is what the file says at the moment of pressing Run, not what it said when the button appeared.
- A workspace's file that can't be made sense of shows a quiet warning in the title bar, with the reason. It does not fall back to the main branch's file.

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

**Decision:** The daemon reads and parses the file, and sends what it says with the rest of what it knows of a worktree (ADR-003). To run the command, the forge only says "run"; the daemon reads the file again and runs what it finds.
**Why:** The file is on the daemon's machine, and changes with the files the daemon already watches. Not passing the command through the forge and the browser leaves no way to make a daemon run something the file doesn't say.
**Tradeoff:** One more request per refresh of a worktree's state.

### 4. Run is a terminal

**Decision:** The command runs in a terminal like any other (ADR-003), under a fixed name, rather than as a new kind of process.
**Why:** A dev server prints, takes Ctrl+C, and sometimes asks a question: a terminal does all of that already, survives a restart of the forge, and needed nothing new.
**Tradeoff:** Like all terminals, it ends when the daemon does. Geordi knows that the terminal is open, not whether the server in it is up.

## Out of Scope

- More than one command, setup and teardown scripts, ports and previews.
- Starting the command by itself, or on the agent's behalf.
- The agent knowing about, or using, the run command.
