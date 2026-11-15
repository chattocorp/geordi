# FDR-004: Choosing the agent, its model and its effort

**Status:** Active
**Last reviewed:** 2026-11-15

## Overview

When starting a workspace, people choose who does the work: which agent (Claude Code, Codex), which of its models, and how hard it should think. A quick fix wants a small, fast model; a hard design problem wants the best one at full effort.

## Behavior

- The new-workspace composer has one quiet line under the text that says who will do the work: the agent or its model, and the effort if one is set ("Opus High"). Clicking it opens a list.
- The list holds every agent and, after each, its models, as the connected daemon reports them. Picking an agent itself leaves the model to the agent's CLI: its own default, or what the user configured for it. Typing a few letters searches the list ("g6l" finds "GPT-6-Luna", "codex" finds everything Codex can run).
- Under the list is the reasoning effort, as a row of rising bars: the levels of the model picked, the lowest being "Default", which again leaves it to the CLI. An agent that reports no levels has no such row.
- The browser remembers the choice, per agent: the next workspace starts out the way the last one was set up. A remembered model or effort that is no longer on offer falls back to the default.
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

### 4. One line, one list

**Decision:** Agent, model and effort are one control: a line of text that opens one list, rather than a row of chips and menus. It is built from `Select` (a searchable list in a popover, with fuzzy matching) and `Steps` (a level as rising bars) from the design system.
**Why:** The composer is for saying what should be done. Who does it is set once and rarely changed, so it should take one quiet line, not compete with the text (the UI stays calm). An agent and its models are one question: "who does this?".
**Tradeoff:** Changing just the effort takes opening the list. And these are controls of our own to keep accessible, where the browser's select needed no code; they build on the browser's popover, which handles the top layer, outside clicks and Escape.
