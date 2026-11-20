# FDR-014: Deleting archived workspaces for good

**Status:** Active
**Last reviewed:** 2026-11-20

## Overview

Archiving a workspace keeps its conversation, so the event log only ever grows, and most of it is agent output from work that is done. In the archive, a person can delete archived workspaces for good, one at a time or all of them. This makes Geordi's data smaller and its start faster.

## Behavior

- In **Archive**, right-click a workspace and choose **Delete permanently…**, or select **Delete all** next to the search. While a search is entered, that button reads **Delete N** and deletes only the workspaces listed.
- A dialog asks first. It names the one workspace, or says how many there are, and says that this can't be undone and that Git branches are kept.
- A workspace is deleted together with the agents it started and those working alongside it in its worktree. If one of them isn't archived (it was restored, say), nothing is deleted and the dialog says which one stands in the way.
- Images sent in those conversations are deleted with them. Their files go too, unless another image has the same bytes.
- Afterwards, the archive says how many workspaces were deleted and how much space that freed.
- Everything else is as it was:
  - **Messages:** a message one of their agents sent to another workspace still shows as that agent's, under the name it had.
  - **Shared worktrees:** a workspace one of them worked alongside still knows where its worktree is.
  - **Branches and folders:** Git branches and a project's folder stay on disk.
- A page of a deleted workspace that is still open says that the workspace can't be found.

## Design Decisions

### 1. Deleted, not hidden

**Decision:** The workspaces' events are removed from the log, and the file is compacted.
**Why:** The point is to give space back and keep startup quick. Hiding them would do neither (ADR-012).
**Tradeoff:** It can't be undone; only a backup brings them back.

### 2. Only at a person's word, only from the archive

**Decision:** No agent tool and no automatic rule deletes workspaces. It's only offered for workspaces that are already archived.
**Why:** Deleting is the one thing in Geordi that loses history. A person decides it, looking at what goes.
**Tradeoff:** The log grows until someone trims it. An automatic rule (for example, everything archived for a month) could come later.

### 3. Whole families

**Decision:** A workspace goes together with every agent it started and every agent in its worktree, and only when all of them are archived.
**Why:** Archiving treats them as one piece of work (FDR-001). Deleting part of a family would leave agents pointing at a parent that no longer exists.
**Tradeoff:** One restored child keeps the whole family from being deleted, until it is archived again.

### 4. The whole workspace, not just its agent output

**Decision:** Everything of the workspace goes: title, messages and output.
**Why:** Keeping only the person's side of a conversation would leave a workspace that restores into something nobody wrote.
**Tradeoff:** Nothing at all is left to search for afterwards.

## Related

- **ADRs:** ADR-001, ADR-012
- **FDRs:** FDR-001, FDR-002, FDR-012
