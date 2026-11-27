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

- The outline is edited like any outliner: Enter starts a new item below, Tab and Shift-Tab indent and outdent, Alt with the arrows moves an item, Cmd-Enter (Ctrl-Enter) ticks it off, Alt-Enter starts a workspace on it, Shift-Enter goes to its note, Backspace on an empty item removes it, Escape takes back what was typed. Up and down go from row to row. Rows can also be dragged (FDR-016).
- The outline's last line, "New item", starts one at the end of it. As in Workflowy, a row is its sign and its text, with nothing on it to click besides: to the left of its sign, in the outline's gutter, a row with something under it shows the arrow that folds it, while it is pointed at or folded. Nothing appears on the row itself, so pointing at it moves nothing. Adding under a row, removing it and zooming into it are in its menu and its keys.
- The menu of an item offers starting a workspace on it, adding an item under it, ticking it off, and removing it (with what is under it, where none of it has a workspace). The menu of a workspace offers adding an item under it.
- An item's note is written under its text, smaller and quieter: Shift-Enter in the line goes to it (a new one, where it has none), and so does a click on it. In a note, Enter is a new line; Escape, Shift-Enter, or Up from its start go back to the line. It is saved when it is left; emptied, it is gone. Until it is edited, two lines of it show. An item with a note isn't removed by Backspace.
- An item's menu shows the keys that do the same beside its entries.
- An item's text is saved when you leave the line or press Enter.
- An item's text is one line, however long: it wraps on screen rather than being cut off, and up and down go through it line by line before going on to the next item. Workspaces' rows stay one line each, with their status beside them. An item's sign is its circle, whether or not something is under it; a workspace's, its repository's picture.
- An item ticked off stays where it is, crossed out. "Show only what is active" leaves out archived and inactive workspaces, with what is under them, but never items: ticking one off is not putting it away.
- The sidebar is the whole outline; a workspace's Plan window is its scope.

### Workspaces in the outline

- Starting a workspace attaches it to an item: a new one, or one written down earlier, with no workspaces under it. The item's text, with its note under it, is offered as its first message, and the workspace is named after it, as named by the person. Started on an item under a workspace, it begins in that workspace's repository (the nearest one above); elsewhere, in the one picked last. Agent and model are as last chosen, as for any new workspace.
- A workspace's supervisor is the workspace of the nearest item above its own that has one. Items without a workspace pass authority through (FDR-016). An item at the top, or under items without workspaces only, reports to the person.
- Archiving a workspace ticks its item off. Within a tree still in use (under an item without a workspace, or under a workspace in use), the item stays, as a record that links to the archived conversation. An archived tree leaves the outline with what is under it, as archived workspaces always have; it is in the Archive. A workspace still in use under an archived one is listed at the top.
- Work in use is never hidden: a workspace in use, and what is above it, shows even with "Show only what is active" and under items that are done.
- The workspace's repository shows as the item's icon. The sidebar is no longer grouped by repository; the repository filter stays.

### The Inbox

- A workspace the person starts on no item (from New workspace) lands in the Inbox: a heading that comes first in the outline, with the newest first under it. It is there to be filed: dragged, or moved with the keys, to where it belongs. What an agent starts is under that agent, and what is started on an item stays on it, as ever.
- The Inbox shows only while something in it does. It can be folded and zoomed into, and things can be dropped onto it or written under it, but it can't be renamed, ticked off, moved or removed, and nothing goes above it.
- What is in it reports to the person, as at the top. A workspace archived there leaves the outline, as one at the top does.
- Workspaces from before the Inbox stay where they were.
- In a workspace, Cmd-Shift-M (Ctrl-Shift-M) asks where to move it: a list of the outline's items to search, with the way down to each beside it, and the top of the outline. It goes under the one chosen, as its last, and that item unfolds. The same is in the command palette ("Move this workspace under…").

### A workspace's scope

- A workspace's scope is everything under its item, down to the next items that have workspaces of their own: those are its child agents, with scopes of their own. An agent working in another workspace's directory shares that workspace's scope.
- Its agent sees its scope at the start of every turn, as a checklist (each item with its note, a long one in part), together with the path of items above its own ("you work on _Bump the protocol_, part of _Release 0.9_"). Its child agents it sees as lines of their own, with how many of their items are done ("2 of 3 done"), not their items.
- Its agent can read, add, change (the text, ticked off or not), move and remove the items in its scope, at any depth, and nothing else in the outline. Its instructions ask it to write its plan there before work that changes something, to use those items instead of a todo list of its own, to tick off what it has done (the person's items too) and to add what it finds still to do; it may put its items in order or group them under a heading. Its scope holds no workspaces of its own, so its moves never hand anyone to another supervisor.
- Agents keep a checklist that is there reliably, but seldom write a plan unasked: in tests (2026-11-27, Sonnet and Opus, tasks of a few steps), neither instructions nor a note with the first message made them, though they received both. So a plan comes from whoever asks for one: the person, writing items or asking for a plan, or a lead for the agents it starts. Nothing more is added to agents' messages to push it.
- The person can write an item under a workspace to steer its agent without a message: it sees the item at its next turn.
- Continuing a workspace on a new branch clears what was ticked off right under it, with what is under that, where all of it is done: the last branch's steps, recorded in its pull request. What is still to do stays, and so does anything with a workspace in it: a workspace's items are its own, never its parent's to clear. The note that tells its agent it was continued asks it to read the items still open before it plans anything new.
- The items are the same for everyone: the person edits what the agent wrote, and the other way round.

### The Plan window

- A workspace has a Plan window: its scope, edited as in the sidebar, with the same keys and dragging. Its child agents are rows that lead to them; what is under them is theirs, and not shown. "New item" writes one under the workspace.
- It opens beside the conversation, like the Changes. Dragged into the main area, it is a full-width outline, kept to a readable width.
- With nothing planned yet, it says what the items are for.

### Zooming

- Any item can be zoomed into, in the sidebar and in the Plan window: with Cmd-click on its row (Ctrl-click elsewhere; a workspace's too, rather than opening it), from its menu ("Zoom in"), or with Cmd-. (Ctrl-.) on its row. Its branch is then all the outline shows, under the item itself as the first row, with a back arrow in place of its sign that goes back to where it was zoomed into before, as Back does (one level up, where that isn't known, as after a reload); the whole way down is in the row's tooltip. Cmd-Shift-. zooms out one level.
- Zoomed in, the outline is edited as ever: "New item" and Enter write under the item zoomed into.
- In the sidebar, any item can be zoomed into, a workspace's too: then all of what is under it shows, its child agents' items included. In the Plan window, only items of its scope: a child agent's items are its own.
- The previous and next workspace keys go through what the sidebar shows, zoomed in or not.
- Zooming in or out is a step in the page's history: Back zooms out again, Forward back in, in the sidebar and the Plan window alike. Going to another page keeps the zoom.
- A workspace new to the outline starts folded: when its agent writes its plan under it, only the arrow beside it appears (one started on an item that has items under it stays as it was). Writing an item under it yourself unfolds it.
- Where it is zoomed into is a preference of this browser, as what is folded: for the sidebar, and for each workspace's Plan window. Where that item is gone, the whole outline shows again.

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

### 9. Zooming is a view, not a page

**Decision:** Zooming narrows the outline where it is, the sidebar or the Plan window, and is remembered in the browser. It is a step in the history (shallow routing, as showing a window is), with no URL and no page of its own.
**Why:** An outline is worked on in one place; zooming is how one keeps a long one manageable there, as in any outliner. A page would be a second outline to keep in step with the first.
**Tradeoff:** A zoomed view can't be linked to or opened in another tab; Back steps through zooms before it leaves the page; and the sidebar stays narrow while zoomed. A full-width page may still come (see Open Questions).

### 10. The Inbox is a place, not an item

**Decision:** The Inbox is a fixed place at the top of the outline (`INBOX`): what is in it has it as its parent, and the outline lists it as an entry. A workspace's `workspace.created` says that it lands there (`inbox`). It has no events of its own.
**Why:** As a parent like any other, everything the outline can do works on it unchanged: folding, dragging in and out, the keys, zooming. Not being an item, it can't be edited, moved or removed, with nothing to guard. A flag on the event, rather than a rule about workspaces at the top, leaves outlines from before it as they were.
**Tradeoff:** A parent that is no item: code that walks up the outline must take a missing parent for the top, as it did already for items that are gone.

## Related

- **ADRs:** ADR-001, ADR-004, ADR-016
- **FDRs:** FDR-001, FDR-002, FDR-012, FDR-016, FDR-018

## Open Questions

- A full-width page for the whole outline, perhaps as the home page instead of New workspace.
- A quick filter for the outline (planning `93zrh`) and a shortcut for a new item (planning `2n7x9`).
- A better way to see work by repository than the old grouping.
- Whether items need more than done or not done (due dates, someone assigned).
