# FDR-004: Choosing the agent, its model and its effort

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

When starting a workspace, people choose who does the work: which agent (Claude Code, Codex), which of its models, and how hard it should think. A quick fix wants a small, fast model; a hard design problem wants the best one at full effort.

## Behavior

- The new-workspace composer has up to three quiet choices under the text, in this order: the repository (where there are several), who does the work (the agent, or one of its models), and how hard it should think. Each opens a list.
- The model list holds the models of every agent, as the connected daemon reports them, each with its agent's mark. There is always one chosen: at first, the first agent's first model. Typing a few letters searches the list ("g6l" finds "GPT-6-Luna", "codex" finds everything Codex can run). An agent that reports no models is in the list itself, and runs whatever its CLI is set to.
- A model that is not in the list can be typed in by the name its CLI knows it by (a specific version, say): when nothing in the list matches what was typed, the list offers to use that name with each agent. Geordi can't know whether such a model exists; if not, the agent's first turn fails and says so. Its effort levels are those the agent offers in general.
- The effort list holds the levels of the model picked, which differ from model to model, and "Default effort", which leaves it to the agent's CLI. An effort the newly picked model doesn't have falls back to the default. An agent that reports no levels has no effort to choose.
- What is on offer comes from the daemon, pushed to the page: the moment a daemon connects, the choices are there. While none is connected the composer says "Waiting for the daemon" in their place, and a workspace can't be started.
- The browser remembers the choice, per agent: the next workspace starts out the way the last one was set up. A remembered model that is no longer on offer falls back to the agent's first; an effort, to the default.
- The choice belongs to the workspace, and can be changed there: the box for replying to the agent has the same two choices, for the workspace's agent only. A change holds from the agent's next turn on; a turn under way carries on as it was started.
- An agent started by another agent (FDR-002) runs with its parent's model and effort if it is the same kind of agent, and with the defaults otherwise, unless the parent asks for a model or effort. `start_agent` lists what is on offer, per agent, in its description, and refuses an effort the model doesn't offer.

## Design Decisions

### 1. The daemon says what is on offer

**Decision:** Each agent adapter reports its CLI's models and effort levels, and the daemon tells the forge when it connects. Claude's are the CLI's aliases (`fable`, `opus`, …), which always mean the latest model of their kind. Codex's are read from the list Codex keeps for its own model picker.
**Why:** Models change monthly, and what is available depends on the machine and the account. A list in Geordi's code would be wrong most of the time.
**Tradeoff:** Codex's list is a file of its own, not an interface. If it moves or changes shape, Codex offers no models to choose from until the adapter is updated; it still runs, with its configured model.

### 2. A model is always chosen; effort may be left to the CLI

**Decision:** The list holds models only, with no "default" entry per agent, and Geordi always passes the chosen one. For effort, "Default effort" passes nothing and leaves it to the CLI.
**Why:** "Claude Code" next to "Opus" in one list reads as two kinds of thing. Picking a model is picking the agent. Effort has a sensible default per model that the CLI knows better than we do.
**Tradeoff:** Geordi overrides the model a user configured in their CLI, starting with the first one listed until they pick another.

### 3. One agent per workspace; its model and effort can change

**Decision:** Which agent a workspace has is chosen when it starts and stays. Its model and effort can be changed at any time, in the reply box, and apply from the next turn.
**Why:** A conversation belongs to one CLI's session, which another CLI can't carry on (FDR-001). Within it, a task can turn out harder or easier than it looked: one should be able to bring in a stronger model midway, or stop paying for one.
**Tradeoff:** A conversation can be the work of several models, and nothing in it says which wrote what.

### 4. Two quiet choices

**Decision:** Agent and model are one choice, effort is another: two lines of text that each open a list, rather than a row of chips and pills. Both are `Select` from the design system (a searchable list in a popover, with fuzzy matching).
**Why:** The composer is for saying what should be done. Who does it is set once and rarely changed, so it should take one quiet line, not compete with the text (the UI stays calm). An agent and its models are one question: "who does this?". Effort is a second one, whose answers depend on the first.
**Tradeoff:** These are controls of our own to keep accessible, where the browser's select needed no code; they build on the browser's popover, which handles the top layer, outside clicks and Escape.
