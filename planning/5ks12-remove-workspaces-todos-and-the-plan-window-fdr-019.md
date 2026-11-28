---
data:
  priority: normal
  status: done
  type: task
id: 5ks12
title: Remove workspaces’ todos and the Plan window (FDR-019)
---
The person decided to drop the todo list in the workspace, to do something else in its place. The outline keeps folders and moving workspaces (Cmd-Shift-M).

## Outcome

- Gone: the Plan window, ticking items off, the agents’ item tools (`list_items`, `add_item`, `update_item`, `move_item`, `remove_item`), `item`/`under` on `start_agent`, the outline brief in agents’ instructions, clearing ticked items on continue.
- Gone too: starting a workspace on an item written down earlier (Alt-Enter, the item's menu, `?item=` on the start page, `itemId`).
- An item without a workspace is a folder, never under a workspace (refused by the forge).
- Old events are read: `item.completed`/`item.reopened` change nothing; what is left of todos is not shown (`underWorkspace` in `items.ts`).
- FDR-019 (decision 11) and ADR-016 (amendment) say so; unreleased release notes were rewritten to what ships.