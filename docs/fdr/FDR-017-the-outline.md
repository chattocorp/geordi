# FDR-017: The outline

**Status:** Planned
**Last reviewed:** 2026-11-26

## Overview

The outline is Geordi's main artifact: one tree of items in which the person plans, groups and follows their work. An item is a line of text. It can stand on its own (a heading, a folder, a todo) or have a workspace attached, which makes it a piece of work with an agent. Items under a workspace's item are that workspace's own: its todos, which the person and its agent keep together. It extends FDR-016: the outline is still the chain of command, but it is no longer made of workspaces only.

When stage 1 ships, this replaces FDR-016's account of how workspaces sit in the outline; who supervises whom stays as FDR-016 decided.

## Behavior

### Items

- Every entry in the outline is an item: a line of text, with an optional note under it. It can be ticked off as done.
- An item can have a workspace attached. Its text is then the workspace's name: renaming the workspace, by the person or by its agent, changes the item, and the other way round.
- Items nest freely. An item without a workspace can sit anywhere, under any item.

### Editing

- The outline is edited like any outliner: Enter starts a new item below, Tab and Shift-Tab indent and outdent, Alt with the arrows moves an item, Space ticks off the selected one, Backspace on an empty item removes it. Rows can also be dragged (FDR-016).
- An item's text is saved when you leave the line or press Enter.
- Done items can be hidden.
- Stage 1 edits the outline in the sidebar, which is the outline. A full-width page for it may follow (see Open Questions).

### Workspaces in the outline

- Starting a workspace attaches it to an item: a new one, or one written down earlier. The item's text is its first message.
- A workspace's supervisor is the workspace of the nearest item above its own that has one. Items without a workspace pass authority through (FDR-016). An item at the top, or under items without workspaces only, reports to the person.
- Archiving a workspace ticks its item off. The item stays, as a record that links to the archived conversation.
- The workspace's repository shows as the item's icon. The sidebar is no longer grouped by repository; the repository filter stays.

### A workspace's scope

- A workspace's scope is everything under its item, down to the next items that have workspaces of their own: those are its child agents, with scopes of their own.
- A workspace shows its scope in a tab of its own, editable there as in the outline.
- Its agent sees its scope with every turn, as a checklist, together with the path of items above its own ("you work on _Bump the protocol_, part of _Release 0.9_"). Its child agents' scopes it sees only as a summary ("2 of 3 done").
- Its agent can add, edit, tick off and reorder the items in its scope, and nothing else in the outline.
- When an agent delegates, the new workspace's item is created in its scope. The person can start an agent on any todo the same way.
- Where an agent keeps a plan of its own (Claude Code's and Codex's todo lists), it is kept as items in its scope, so its progress shows without it doing anything more.

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

**Decision:** Stage 1: items, outliner editing and workspaces attached to items. Stage 2: scopes (the workspace's tab, the agent's tools and checklist). Stage 3: delegation onto items, the path as a brief, agents' plans as items.
**Why:** Each stage is useful by itself, and stage 1 is the change underneath that the others need.
**Tradeoff:** For a while the outline is only a better sidebar.

## Related

- **ADRs:** ADR-001, ADR-004, ADR-016
- **FDRs:** FDR-001, FDR-002, FDR-012, FDR-016

## Open Questions

- A full-width outline page, perhaps as the home page instead of New workspace, once editing in the sidebar shows whether it is too narrow.
- A better way to see work by repository than the old grouping.
- Whether items need more than done or not done (due dates, someone assigned).
