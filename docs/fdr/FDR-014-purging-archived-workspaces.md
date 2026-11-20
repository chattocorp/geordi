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
- Afterwards, the archive says how many workspaces were deleted and how much smaller Geordi's log got. Until the next deletion, the copy of the data from before it (below) takes about the old size.
- Everything else is as it was:
  - **Messages:** a message one of their agents sent to another workspace still shows as that agent's, under the name it had.
  - **Shared worktrees:** a workspace one of them worked alongside still knows where its worktree is.
  - **Branches and folders:** Git branches and a project's folder stay on disk.
- A page of a deleted workspace that is still open says that the workspace can't be found.
- Before each deletion, Geordi keeps a copy of its data as it was, in a folder named after the time in `purge-copies` in its data directory (`~/.geordi`), together with the image files the deletion took. Once a deletion has gone through, the copies before it are removed; a deletion that fails leaves them as they were.
- The last deletion can be undone by hand. **This brings back the data as it was just before that deletion: whatever happened in Geordi since then (new messages, new workspaces) is lost.** To keep it, set the current data aside first, and take only what you need from the copy.
  1. Quit Geordi.
  2. To keep what happened since the deletion, move `events.db` somewhere else, with `events.db-wal` and `events.db-shm` if they are there, and copy the `blobs` folder next to them if there is one. That is a complete set of data on its own.
  3. In `purge-copies`, take the newest folder named by a time alone, such as `2026-11-20T11-40-19.123Z-1a2b3c4d`, and move the `events.db` in it into the data directory. Folders starting with `pending-` are of deletions that never went through, with one exception: if Geordi's log says "could not mark the copy of the log" for the last deletion, its copy kept the `pending-` name, and the newest `pending-` folder is the one to take.
  4. If that folder has a `blobs` folder, move the files in it into `blobs` (make `blobs` if there is none).
  5. Start Geordi again.

## Design Decisions

### 1. Deleted, not hidden

**Decision:** The workspaces' events are removed from the log, and the file is compacted.
**Why:** The point is to give space back and keep startup quick. Hiding them would do neither (ADR-012).
**Tradeoff:** Geordi itself can't undo it. Only the copy of the last deletion (below), or a backup, brings them back.

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

### 5. A copy of the last deletion, not an undo button

**Decision:** Each deletion first copies the data as it was, replacing the copy before; there is no undo in the interface.
**Why:** A wrong **Delete all** should not be the end of everything, but an undo would mean keeping deleted workspaces around, which defeats the point. One copy, replaced each time, costs the size of the log once.
**Tradeoff:** Undoing takes a few steps by hand, while Geordi isn't running, and only the last deletion can be undone.

## Related

- **ADRs:** ADR-001, ADR-012
- **FDRs:** FDR-001, FDR-002, FDR-012
