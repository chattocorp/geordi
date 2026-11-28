# FDR-019: The outline

**Status:** Active
**Last reviewed:** 2026-11-28

## Overview

The outline is Geordi's main artifact: one tree of items in which the person groups and follows their work. An item is a line of text. It can have a workspace attached, which makes it a piece of work with an agent. Without one, it is a folder, which groups workspaces. It extends FDR-016: the outline is still the chain of command, but it is no longer made of workspaces only.

For a while a workspace had todos too: items under its own, which the person and its agent kept as a checklist, in a Plan window. They are gone (decision 11). It replaces FDR-016's grouping by repository; who supervises whom stays as FDR-016 decided.

## Behavior

### Items

- Every entry in the outline is an item: a line of text, with an optional note under it.
- An item can have a workspace attached. Its text is then the workspace's name: renaming the workspace, by the person or by its agent, changes the item, and the other way round.
- Folders nest freely, among each other and at the top. Under a workspace are its child agents only: no folder is written or moved there.
- What is left of workspaces' todos is not shown. A workspace that was filed under one shows right under the workspace that supervises it.

### Editing

- The outline is edited like any outliner: Enter starts a new item below, Tab and Shift-Tab indent and outdent (never under a workspace's row, by Tab or by dragging), Alt with the arrows moves an item, Shift-Enter goes to its note, Backspace on an empty item removes it, Escape takes back what was typed. Up and down go from row to row. Rows can also be dragged (FDR-016).
- The outline's last line starts a new item at the end of it: "New folder". As in Workflowy, a row is its sign and its text, with nothing on it to click besides: to the left of its sign, in the outline's gutter, a row with something under it shows the arrow that folds it, while it is pointed at or folded. Nothing appears on the row itself, so pointing at it moves nothing. Adding under a row, removing it and zooming into it are in its menu and its keys.
- The menu of an item offers adding a folder under it, and removing it (with what is under it, where none of it has a workspace).
- An item's note is written under its text, smaller and quieter: Shift-Enter in the line goes to it (a new one, where it has none), and so does a click on it. In a note, Enter is a new line; Escape, Shift-Enter, or Up from its start go back to the line. It is saved when it is left; emptied, it is gone. Until it is edited, two lines of it show. An item with a note isn't removed by Backspace.
- An item's menu shows the keys that do the same beside its entries.
- An item's text is saved when you leave the line or press Enter.
- An item's text is one line, however long: in the sidebar a long one is cut short, as it is a map to find things in, read at a glance. A folder's sign is a folder; a workspace's, its repository's picture.
- "Show only what is active" leaves out archived and inactive workspaces, with what is under them, but never folders.

### Workspaces in the outline

- A workspace always has an item of its own, made with it. A folder never becomes a workspace.
- A workspace's supervisor is the workspace of the nearest item above its own that has one. Items without a workspace pass authority through (FDR-016). An item at the top, or under items without workspaces only, reports to the person.
- Within a tree still in use (under an item without a workspace, or under a workspace in use), the item stays, as a record that links to the archived conversation. An archived tree leaves the outline with what is under it, as archived workspaces always have; it is in the Archive. A workspace still in use under an archived one is listed at the top.
- Work in use is never hidden: a workspace in use, and what is above it, shows even with "Show only what is active" and under archived ones.
- The workspace's repository shows as the item's icon. The sidebar is no longer grouped by repository; the repository filter stays.

### New workspaces

- A workspace the person starts on no item (from New workspace) is put at the top of the outline, first. From there it is filed: dragged, or moved with the keys, to where it belongs. What an agent starts is under that agent.
- In a workspace, Cmd-Shift-M (Ctrl-Shift-M) asks where to move it: a list of the outline's items to search, with the way down to each beside it, and the top of the outline. It goes under the one chosen, as its last, and that item unfolds. The same is in the command palette ("Move this workspace under…").

### Zooming

- Any item can be zoomed into: with Cmd-click on its row (Ctrl-click elsewhere; a workspace's too, rather than opening it), from its menu ("Zoom in"), or with Cmd-. (Ctrl-.) on its row. Its branch is then all the outline shows, under the item itself as the first row, with a back arrow in place of its sign that goes back to where it was zoomed into before, as Back does (one level up, where that isn't known, as after a reload); the whole way down is in the row's tooltip. Cmd-Shift-. zooms out one level.
- Zoomed in, the outline is edited as ever: "New item" and Enter write under the item zoomed into.
- Any row can be zoomed into, a workspace's too: then the workspaces under it show.
- The previous and next workspace keys go through what the sidebar shows, zoomed in or not.
- Zooming in or out is a step in the page's history: Back zooms out again, Forward back in. Going to another page keeps the zoom.
- Where it is zoomed into is a preference of this browser, as what is folded. Where that item is gone, the whole outline shows again.

## Design Decisions

### 1. One kind of entry: the item

**Decision:** Folders and work under way are both items. A workspace is attached to an item, never an entry of its own (ADR-016).
**Why:** One thing to store and to edit. Workspaces with fields left empty (projects, FDR-012) taught us what the alternative costs.
**Tradeoff:** The workspace's place in the tree, and its parent, move from the workspaces domain into the items domain, and everything that read them there has to change.

### 2. A workspace's name is its item's text

**Decision:** One value, kept on the item, shown as both.
**Why:** Two names for the same row would drift apart, and the outline must read as the work.
**Tradeoff:** An agent naming its workspace rewrites a line the person may have written.

### 4. The outline before repositories

**Decision:** The sidebar shows one outline, with each workspace's repository as its icon. Grouping by repository is dropped.
**Why:** Items need not belong to a repository, and a tree is one piece of work across repositories (FDR-016).
**Tradeoff:** People who found their work by repository lose the headings; the repository filter remains. A better way to see work by repository may come later.

### 5. Saving on leaving a line

**Decision:** An item's text is recorded on Enter or when the line loses focus, not per keystroke.
**Why:** Every edit is an event (ADR-001); typing must not flood the log or other viewers.
**Tradeoff:** Text being typed is not live for other viewers or agents until the line is left.

### 9. Zooming is a view, not a page

**Decision:** Zooming narrows the outline where it is, and is remembered in the browser. It is a step in the history (shallow routing, as showing a window is), with no URL and no page of its own.
**Why:** An outline is worked on in one place; zooming is how one keeps a long one manageable there, as in any outliner. A page would be a second outline to keep in step with the first.
**Tradeoff:** A zoomed view can't be linked to or opened in another tab; Back steps through zooms before it leaves the page; and the sidebar stays narrow while zoomed. A full-width page may still come (see Open Questions).

### 10. No Inbox

**Decision:** New workspaces land at the top of the outline, first, with no heading of their own. For a short while there was an Inbox, a place at the top they landed in; events from then (`inbox` on `workspace.created`, `inbox` as a parent) are read as the top.
**Why:** The Inbox was a second top: one more row, one more level, and rules of its own (nothing above it, not to be renamed or moved) for what the top of the outline already does. New work coming first is enough to find it and to file it.
**Tradeoff:** What is new sits among what is arranged at the top until it is filed, with nothing to tell the two apart but its place.

### 11. No todos

**Decision:** A workspace has no todos, and no Plan window. The outline holds folders and workspaces only; agents have no tools for it, and are told nothing about it. Events from when there were todos are still read: `item.completed` and `item.reopened` change nothing, and items without a workspace under a workspace's item (`underWorkspace`) are left out of what is shown, a workspace filed under one showing right under its supervisor. `start_agent` no longer takes `item` or `under`. Starting a workspace on an item written down earlier (Alt-Enter, its menu) is gone with them: it was how a todo became work, and a folder is not work to be started. A workspace started that way has its item's ID, and events from then are read as before (`attach`).
**Why:** Decided on 2026-11-28, to make room for something else in its place. The checklist had not proven itself: agents kept it only when asked (in tests on 2026-11-27, neither instructions nor a note with the first message made them write a plan unasked), and it cost a window, five tools and a paragraph of instructions with every turn. Folders, and moving workspaces among them, stay as they are.
**Tradeoff:** Nothing to steer an agent with but a message, and a lead can no longer hand a written step to a child or group its children under a heading. What was written as todos stays in the event log, unseen.

## Related

- **ADRs:** ADR-001, ADR-004, ADR-016
- **FDRs:** FDR-001, FDR-002, FDR-012, FDR-016, FDR-018

## Open Questions

- A full-width page for the whole outline, perhaps as the home page instead of New workspace.
- A quick filter for the outline (planning `93zrh`) and a shortcut for a new item (planning `2n7x9`).
- A better way to see work by repository than the old grouping.
