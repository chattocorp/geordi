# FDR-004: Choosing the agent, its model and its effort

**Status:** Active
**Last reviewed:** 2026-11-15

## Overview

When starting a workspace, people choose who does the work: which agent (Claude Code, Codex), which of its models, and how hard it should think. A quick fix wants a small, fast model; a hard design problem wants the best one at full effort.

## Behavior

- The new-workspace composer has, next to the agents, a model and a reasoning effort to choose. Both start at "Default", which leaves the decision to the agent's CLI: its own default, or what the user configured for it.
- The models and effort levels on offer are those of the agent picked, as the connected daemon reports them. The effort levels are those of the model picked. An agent that reports none offers nothing to choose.
- Both open a list that can be searched by typing a few letters of what is wanted.
- The effort shows as a small meter: as many bars lit as the effort is high.
- The browser remembers the choice, per agent: the next workspace starts out the way the last one was set up. A remembered model or effort that is no longer on offer falls back to "Default".
- The choice belongs to the workspace and holds for all of its turns. The workspace's header shows it.
- An agent started by another agent (FDR-002) runs with its parent's model and effort if it is the same kind of agent, and with the defaults otherwise.

## Design Decisions

### 1. The daemon says what is on offer

**Decision:** Each agent adapter reports its CLI's models and effort levels, and the daemon tells the forge when it connects. Claude's are the CLI's aliases (`fable`, `opus`, …), which always mean the latest model of their kind. Codex's are read from the list Codex keeps for its own model picker.
**Why:** Models change monthly, and what is available depends on the machine and the account. A list in Geordi's code would be wrong most of the time.
**Tradeoff:** Codex's list is a file of its own, not an interface. If it moves or changes shape, Codex offers no models to choose from until the adapter is updated; it still runs, with its configured model.

### 2. "Default" means nothing is passed

**Decision:** Without a choice, Geordi passes no model or effort to the CLI, and records none.
**Why:** People have set up their CLIs the way they like them. Geordi should not override that unasked.
**Tradeoff:** A workspace with defaults doesn't say which model it actually ran.

### 3. Chosen once, for the workspace

**Decision:** Model and effort are chosen when the workspace starts, and can't be changed afterwards.
**Why:** One conversation, one agent, one way of running it keeps the model simple (FDR-001). Wanting something else is a new workspace.
**Tradeoff:** No switching to a stronger model midway when a task turns out to be hard.

### 4. A select of our own, with search

**Decision:** Model and effort are chosen with `Select` from the design system: a quiet pill that opens a list in Geordi's own look, with a search field that matches fuzzily ("g6l" finds "GPT-6-Luna"). Arrow keys and Enter pick, Escape closes. While the default is chosen, the pill just says what it is for ("Model", "Effort").
**Why:** Codex alone offers ten models, and the list will grow; typing a few letters beats scanning it. The browser's own select looks like the operating system, not like Geordi.
**Tradeoff:** Code of ours to keep accessible and working, where the browser's select needed none. It builds on the browser's popover, which handles the top layer, closing on outside clicks and Escape.
