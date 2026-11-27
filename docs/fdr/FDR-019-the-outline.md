# FDR-019: The outline

**Status:** Active
**Last reviewed:** 2026-11-27

## Overview

The outline is Geordi's main artifact: one tree of items in which the person plans, groups and follows their work. An item is a line of text. It can stand on its own (a heading, a folder, a todo) or have a workspace attached, which makes it a piece of work with an agent. Items under a workspace's item are that workspace's own: its todos, which the person and its agent keep together. It extends FDR-016: the outline is still the chain of command, but it is no longer made of workspaces only.

Stages 1 to 3 (items, editing, workspaces on items; a workspace's scope, kept by its agent; agents starting agents on their items) are in place. It replaces FDR-016's grouping by repository; who supervises whom stays as FDR-016 decided.

## Behavior

### Items

- Every entry in the outline is an item: a line of text, with an optional note under it. It can be ticked off as done.
- An item can have a workspace attached. Its text is then the workspace's name: renaming the workspace, by the person or by its agent, changes the item, and the other way round.
- Items nest freely. An item without a workspace can sit anywhere, under any item.

### Editing

- The outline is edited like any outliner: Enter starts a new item below, Tab and Shift-Tab indent and outdent, Alt with the arrows moves an item, Cmd-Enter (Ctrl-Enter) ticks it off, Backspace on an empty item removes it, Escape takes back what was typed. Up and down go from row to row. Rows can also be dragged (FDR-016).
- The outline's last line, "New item", starts one at the end of it. Every row, item or workspace, offers a "+" while it is pointed at, which starts an item under it, as its last. An item that is done offers an "×" instead, which removes it (with what is under it).
- The menu of an item offers starting a workspace on it, adding an item under it, ticking it off, and removing it (with what is under it, where none of it has a workspace). The menu of a workspace offers adding an item under it.
- An item's text is saved when you leave the line or press Enter.
- An item ticked off stays where it is, crossed out. "Show only what is active" leaves out archived and inactive workspaces, with what is under them, but never items: ticking one off is not putting it away.
- The sidebar is the whole outline; a workspace's Plan window is its scope.

### Workspaces in the outline

- Starting a workspace attaches it to an item: a new one, or one written down earlier, with no workspaces under it. The item's text is offered as its first message, and the workspace is named after it, as named by the person.
- A workspace's supervisor is the workspace of the nearest item above its own that has one. Items without a workspace pass authority through (FDR-016). An item at the top, or under items without workspaces only, reports to the person.
- Archiving a workspace ticks its item off. Within a tree still in use (under an item without a workspace, or under a workspace in use), the item stays, as a record that links to the archived conversation. An archived tree leaves the outline with what is under it, as archived workspaces always have; it is in the Archive. A workspace still in use under an archived one is listed at the top.
- Work in use is never hidden: a workspace in use, and what is above it, shows even with "Show only what is active" and under items that are done.
- The workspace's repository shows as the item's icon. The sidebar is no longer grouped by repository; the repository filter stays.

### A workspace's scope

- A workspace's scope is everything under its item, down to the next items that have workspaces of their own: those are its child agents, with scopes of their own. An agent working in another workspace's directory shares that workspace's scope.
- Its agent sees its scope at the start of every turn, as a checklist, together with the path of items above its own ("you work on _Bump the protocol_, part of _Release 0.9_"). Its child agents it sees as lines of their own, with how many of their items are done ("2 of 3 done"), not their items.
- Its agent can read, add, change (the text, ticked off or not), move and remove the items in its scope, at any depth, and nothing else in the outline. Its instructions ask it to write its plan there before work that changes something, to use those items instead of a todo list of its own, to tick off what it has done (the person's items too) and to add what it finds still to do; it may put its items in order or group them under a heading. Its scope holds no workspaces of its own, so its moves never hand anyone to another supervisor.
- Agents keep a checklist that is there reliably, but seldom write a plan unasked: in tests (2026-11-27, Sonnet and Opus, tasks of a few steps), neither instructions nor a note with the first message made them, though they received both. So a plan comes from whoever asks for one: the person, writing items or asking for a plan, or a lead for the agents it starts. Nothing more is added to agents' messages to push it.
- The person can write an item under a workspace to steer its agent without a message: it sees the item at its next turn.
- The items are the same for everyone: the person edits what the agent wrote, and the other way round.

### The Plan window

- A workspace has a Plan window: its scope, edited as in the sidebar, with the same keys and dragging. Its child agents are rows that lead to them; what is under them is theirs, and not shown. "New item" writes one under the workspace.
- It opens beside the conversation, like the Changes. Dragged into the main area, it is a full-width outline, kept to a readable width.
- With nothing planned yet, it says what the items are for.

### Agents starting agents on items

- An agent starts another on one of its items (`start_agent` with `item`), as the person does from an item's menu: the item becomes the new workspace, named after it, and the items under it become the new agent's checklist. The starting agent sees it from then on as a child agent with its progress. As for the person, only an item with no agents under it.
- An agent can file a new workspace under one of its items instead (`under`): a heading grouping several agents' work. It still reports to the agent that started it.
- Repository, agent, model and effort are chosen as with any `start_agent`; an item holds no settings of its own.
- Agents keep their own todo lists (Claude Code's plans) to themselves: they change too often to belong in the outline. What goes there is written on purpose.

## Design Decisions

### 1. One kind of entry: the item

**Decision:** Folders, todos and work under way are all items. A workspace is attached to an item, never an entry of its own (ADR-016).
**Why:** One thing to learn and to edit. A todo becomes work by attaching an agent to it, without moving or copying anything. Workspaces with fields left empty (projects, FDR-012) taught us what the alternative costs.
**Tradeoff:** The workspace's place in the tree, and its parent, move from the workspaces domain into the items domain, and everything that read them there has to change.

### 2. A workspace's name is its item's text

**Decision:** One value, kept on the item, shown as both.
**Why:** Two names for the same row would drift apart, and the outline must read as the work.
**Tradeoff:** An agent naming its workspace rewrites a line the person may have written.

### 3. Scopes end where the next workspace begins

**Decision:** An agent owns the items under its own, down to the next items with workspaces. Inside its children's scopes it sees summaries only.
**Why:** Each agent gets its own list, and no two agents edit the same items. A lead needs to know how its children are doing, not to manage their todos.
**Tradeoff:** A lead can't fix a child's list itself; it tells the child.

### 4. The outline before repositories

**Decision:** The sidebar shows one outline, with each workspace's repository as its icon. Grouping by repository is dropped.
**Why:** Items need not belong to a repository, and a tree is one piece of work across repositories (FDR-016).
**Tradeoff:** People who found their work by repository lose the headings; the repository filter remains. A better way to see work by repository may come later.

### 5. Saving on leaving a line

**Decision:** An item's text is recorded on Enter or when the line loses focus, not per keystroke.
**Why:** Every edit is an event (ADR-001); typing must not flood the log or other viewers.
**Tradeoff:** Text being typed is not live for other viewers or agents until the line is left.

### 6. Staged

**Decision:** Stage 1: items, outliner editing and workspaces attached to items. Stage 2: scopes (the agent's checklist and tools; the sidebar shows them). Stage 3: agents starting agents on their items. Then the Plan window, a scope as a window of its own.
**Why:** Each stage is useful by itself, and stage 1 is the change underneath that the others need.
**Tradeoff:** For a while the outline is only a better sidebar.

### 7. Starting on an item turns it into the workspace

**Decision:** Starting an agent on an item attaches the workspace to that item, for agents as for people; putting a workspace under an item is a separate choice, for grouping.
**Why:** One piece of work is one row. A todo with the work under it would be two rows for one thing, and a todo someone must remember to tick off when the work is done. The items under it becoming the new agent's checklist is the handing over.
**Tradeoff:** The item leaves the starting agent's own checklist: from then on someone else does it, and the starter sees it as an agent.

### 8. The Plan window is a window, not a page

**Decision:** A workspace's scope is a window of the workspace, beside the conversation or in the main area, and shares the sidebar's outline editor.
**Why:** The plan belongs with the work: it is read while the agent works, next to what it says. A window can be as narrow or as wide as the person makes it, so one thing serves both, and one editor means one set of keys to learn.
**Tradeoff:** The workspace's items show twice, in the sidebar and in its window. Both are the same items, and edits show in both.

## Related

- **ADRs:** ADR-001, ADR-004, ADR-016
- **FDRs:** FDR-001, FDR-002, FDR-012, FDR-016, FDR-018

## Open Questions

- A full-width page for the whole outline, perhaps as the home page instead of New workspace; and zooming into any item's branch (planning `dfxvp`), which may be the same thing.
- A quick filter for the outline (planning `93zrh`) and a shortcut for a new item (planning `2n7x9`).
- A better way to see work by repository than the old grouping.
- Whether items need more than done or not done (due dates, someone assigned).
