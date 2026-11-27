# ADR-016: Items are the outline's primitive; workspaces are attached to them

**Date:** 2026-11-26

## Context

Since FDR-016, the sidebar is an outline of workspaces, and the outline is the chain of command: a workspace's parent is the workspace that supervises it, kept on the workspace itself (`parentId`, moved with `workspace.moved`).

We want the outline to become Geordi's main artifact (FDR-019): something people write in, with entries that are not work being done yet. They are folders that group work, todos inside a piece of work, and plans to start an agent on later. None of these is a workspace: they have no agent, no repository and no worktree. Making them workspaces with fields left empty is what projects did (FDR-012, deprecated, planning `nzqqn`), and every piece of code that assumes a repository had to learn to leave them out.

We considered:

- **Folders and todos as kinds of workspace.** One tree, but a workspace that is no workspace, the project mistake again.
- **A second tree beside the workspaces**, with folders and todos pointing at workspaces. The outline would then live in two places, and authority would follow one tree while people arrange the other (rejected in FDR-016 for the same reason).
- **One tree of items, with workspaces attached to some of them.**

## Decision

- **The outline is a tree of items, with events of its own** (`item.*`, `items.ts`), event-sourced like every other (ADR-001). An item has a line of text, an optional note, a parent item, a place among its siblings, whether it is done, and at most one workspace attached.
- **A workspace is always attached to exactly one item, with the workspace's ID.** Its place in the outline is its item's place. The item's text is the workspace's name: renaming either renames both. The one value stays on the workspace, where agents and people already name it.
- **The outline is kept by the workspaces' projection**, beside the workspaces, because who supervises whom is derived from it at every event. `items.ts` holds the tree's pure rules; the commands that change it live with the workspaces' (moving an item can hand workspaces to another supervisor, with what that involves).
- **Authority is derived from the tree of items.** A workspace's parent is the workspace of the nearest item above its own that has one. Items without a workspace in between pass authority through. The workspace's `parentId` is no longer recorded but derived: the projection sets it from the outline whenever an item moves, so everything that asks for a parent (messaging, reports, questions, archiving, inactivity) gets the outline's answer unchanged.
- **A workspace's scope** is the subtree of its item, down to, but not into, the next items that have workspaces. Its agent may read and change the items in its scope, and nothing else in the outline.
- **A workspace's item comes with it:** `workspace.created` makes it (at the top, or under its starter's item), or attaches the workspace to an item written down earlier, whose ID it takes. A workspace's item moves with `workspace.moved`; items without workspaces have `item.moved`.
- **Nothing old needs translating:** replaying `workspace.created` and `workspace.moved` gives every existing workspace its item, under its parent's, where people moved it.
- **Edits are recorded when they are made, not as they are typed:** an item's text is appended when a line is left or Enter is pressed, so typing doesn't fill the log.

## Consequences

- Folders, todos and work to be done later are the same thing as work under way, with or without a workspace. Starting an agent on a todo is attaching a workspace to it, and delegating (`start_agent`) creates an item in the caller's scope and attaches the new workspace to it.
- The chain of command keeps working as FDR-016 defined it, now with items between workspaces that don't count.
- An agent's scope gives it a todo list of its own that people can see and edit, without a second store.
- Code that reads a workspace's `parentId` keeps working; the projection has to keep it in step with every move of an item, including items without workspaces between two that have them.
- A purge (ADR-012) takes a workspace's item with it, and the items without workspaces under it.
- Archived workspaces stay in the outline only as records inside trees still in use; archived trees leave it. Otherwise every workspace ever archived would be an item, in every window, on every change.
- Existing installations need nothing done: replaying their events gives every workspace the parent it had. Going back to an earlier version is safe too: it ignores `item.*` events, and a workspace moved under an item without a workspace is listed at the top there.
- Grouping the sidebar by repository no longer fits a tree whose items need not belong to any repository; it is dropped for now (FDR-019).
- Items are written by people and by agents at once. Each edit replaces the fields it changes, and the last one wins; there is no merging of concurrent text edits.
