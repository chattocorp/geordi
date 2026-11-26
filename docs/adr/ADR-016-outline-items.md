# ADR-016: Items are the outline's primitive; workspaces are attached to them

**Date:** 2026-11-26

## Context

Since FDR-016, the sidebar is an outline of workspaces, and the outline is the chain of command: a workspace's parent is the workspace that supervises it, kept on the workspace itself (`parentId`, moved with `workspace.moved`).

We want the outline to become Geordi's main artifact (FDR-017): something people write in, with entries that are not work being done yet. They are folders that group work, todos inside a piece of work, and plans to start an agent on later. None of these is a workspace: they have no agent, no repository and no worktree. Making them workspaces with fields left empty is what projects did (FDR-012, deprecated, planning `nzqqn`), and every piece of code that assumes a repository had to learn to leave them out.

We considered:

- **Folders and todos as kinds of workspace.** One tree, but a workspace that is no workspace, the project mistake again.
- **A second tree beside the workspaces**, with folders and todos pointing at workspaces. The outline would then live in two places, and authority would follow one tree while people arrange the other (rejected in FDR-016 for the same reason).
- **One tree of items, with workspaces attached to some of them.**

## Decision

- **The outline is a tree of items, in a domain of its own** (`items.ts`), event-sourced like every other (ADR-001). An item has a line of text, an optional note, a parent item, a place among its siblings, whether it is done, and at most one workspace attached.
- **A workspace is always attached to exactly one item.** Its place in the outline is its item's place. The item's text is the workspace's name: renaming either renames both, one value kept on the item.
- **Authority is derived from the tree of items.** A workspace's parent is the workspace of the nearest item above its own that has one. Items without a workspace in between pass authority through. Everything that asks for a parent today (messaging, reports, questions, archiving, inactivity) asks the items domain instead of a field on the workspace.
- **A workspace's scope** is the subtree of its item, down to, but not into, the next items that have workspaces. Its agent may read and change the items in its scope, and nothing else in the outline.
- **The workspaces domain keeps the conversation, the agent and the worktree**, and no longer holds a place in a tree. Creating a workspace creates or names its item, in the same append.
- **Old events are translated on replay** (as in `legacy.ts`): each workspace gets an item where it was created, under its parent's item, and `workspace.moved` becomes a move of that item.
- **Edits are recorded when they are made, not as they are typed:** an item's text is appended when a line is left or Enter is pressed, so typing doesn't fill the log.

## Consequences

- Folders, todos and work to be done later are the same thing as work under way, with or without a workspace. Starting an agent on a todo is attaching a workspace to it, and delegating (`start_agent`) creates an item in the caller's scope and attaches the new workspace to it.
- The chain of command keeps working as FDR-016 defined it, now with items between workspaces that don't count.
- An agent's scope gives it a todo list of its own that people can see and edit, without a second store.
- Anything that walked `parentId` on workspaces must go through the items domain: the sidebar's listing, the agent API, archiving and inactivity. This is the bulk of the change.
- Workspaces created before this decision have items only by translation on replay. A purge (ADR-012) must take their items with them.
- Grouping the sidebar by repository no longer fits a tree whose items need not belong to any repository; it is dropped for now (FDR-017).
- Items are written by people and by agents at once. Each edit replaces the fields it changes, and the last one wins; there is no merging of concurrent text edits.
