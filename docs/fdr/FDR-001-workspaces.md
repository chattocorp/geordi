# FDR-001: Workspaces

**Status:** Active
**Last reviewed:** 2026-11-14

## Overview

A workspace is a piece of work: one conversation with one agent, in a Git worktree on its own branch, together with the changes made there, their pull request, and terminals. People use it to hand a task to an agent, watch what it changes, steer it, and step in by hand.

## Behavior

- A workspace is started with a first prompt, an agent and a repository: from "New workspace" in the sidebar, where the repository worked in last is preselected, or from a repository's page. It gets its own worktree and branch. It is named after the first line of that prompt at first, and a moment later gets a short title that says what the work is about, if the daemon can ask a model for one.
- A workspace has exactly one conversation. To work on something else, or to have a second agent, start another workspace (or let the agent start one: FDR-002).
- While the agent is working, Enter steers it: the agent is interrupted, and the message is the next thing it reads. Cmd/Ctrl+Enter queues the message instead: it waits and goes out when the agent has finished its turn. Queued messages are shown under the conversation and can be taken back. After a turn that failed or was stopped, they stay put until the person says something.
- The workspace's ID is shown in its header; a click copies it.
- Cmd/Ctrl+B hides and shows the navigation on the left, and with Alt/Option the changes and dock on the right. Both also have a button, and the navigation's edge can be dragged to resize it.
- A workspace has a fixed frame: the main area, and beside it the changes above the dock. The lines between them can be dragged to resize, and that is all that can be changed about the frame.
- The main area holds the conversation, which is always there and stays there. Diffs open next to it as further windows.
- The dock holds terminals. It starts empty.
- Windows are tabs. Within the main area and within the dock, a tab can be dragged onto another group of tabs to move it there, or towards an edge of a group to split it and place the window beside, above or below.
- Diffs and terminals can also be dragged between the two: a terminal out of the dock to sit beside the conversation, a diff into the dock. The conversation cannot leave the main area, and the changes are not a window at all.
- The top bar shows what could happen next (FDR-003).
- **Changes** lists every file that differs from where the workspace branched off, with lines added and removed: committed, uncommitted and untracked work alike. Selecting a file opens its diff as a window next to the conversation. The list updates as files change.
  - A diff shows the changed lines with syntax highlighting and the changed words within a line marked. The unchanged lines between changes are collapsed; they can be revealed a few at a time, upwards or downwards, or all at once, so there is always as much context as wanted without paging through the whole file.
  - Above the list is how the workspace's branch stands on the forge the repository is hosted on: not pushed yet, pushed without a pull request (with a link to open one), or its pull request with state, checks, reviews and target branch, linking to the forge. It appears only for repositories hosted on a forge Geordi knows, and is at most a minute old.
- **Terminals** are shells in the workspace's directory. "+" in the dock opens one. None runs until asked for, there is a tab for every running shell and none for any other, and closing a terminal's tab ends its shell. Terminals keep running while the page is closed and while the forge restarts, and show their recent output when the page is opened again.
- A workspace can be archived when it is done with. That ends its terminals, removes its worktree and takes it out of the lists; its branch and its conversation are kept. Archiving refuses if the worktree has uncommitted or untracked files, and offers to discard them.
- The window arrangement and pane sizes are remembered per browser.

## Design Decisions

### 1. One conversation per workspace

**Decision:** A workspace is one agent conversation, not a container for several.
**Why:** With several, everything about a workspace needed a "which one?": which conversation an action talks to, whose turn it is, what "working" means. One conversation makes a workspace a single thread of work that people can reason about.
**Tradeoff:** Asking a second agent about the same files means another workspace. FDR-002 lets such a workspace work in the same directory.

### 2. A workspace always starts with a prompt

**Decision:** Creating a workspace takes a prompt and starts its agent right away.
**Why:** It keeps the flow from "I have a task" to "an agent is on it" to one step, and gives the workspace a name without asking for one.
**Tradeoff:** There are no empty workspaces for purely manual work.

### 3. A working agent can be steered or queued for, never refused

**Decision:** A message to a working agent either interrupts it (steering, the default) or waits its turn (queueing). Steering stops the agent's turn and starts a new one with the message; the agent keeps its conversation.
**Why:** People see an agent go wrong and want to correct it now, or think of the next thing and want it done after. The workspace's actions (FDR-003) queue, so they can be used at any time.
**Tradeoff:** Steering cuts off whatever the agent was in the middle of, which can leave a half-made change behind. A queued message is written without knowing how the current turn ends, which is why the queue stops after a failed turn rather than pressing on.

### 4. Changes are measured against the fork point

**Decision:** The changes pane compares the working directory with the commit where the workspace's branch left the branch it started from.
**Why:** People want the workspace's total effect, regardless of whether an agent has committed yet.
**Tradeoff:** There is no notion of a target branch other than the pull request's. If the repository's main checkout is on an unrelated branch, the comparison is against that.

### 5. A fixed frame, with freedom only inside it

**Decision:** The frame (main area, changes, dock) is fixed. Tabs and splits exist inside the main area and inside the dock, and only diffs and terminals move between the two. The conversation is pinned to the main area and the changes are not movable.
**Why:** Geordi is opinionated: a workspace should look the same every time, so that people know where things are without arranging anything. The one freedom that earns its place is putting a terminal or a diff where the work is. An earlier version made everything a freely movable window; it could do more and was worse for it, because any drag could dismantle the workspace.
**Tradeoff:** No way to give the changes more room than their pane, or to move the conversation aside. No tab reordering within a group, floating windows or keyboard-driven docking either.

### 6. Layout is a browser preference, not shared state

**Decision:** Which windows are open and how they are arranged is stored in the browser, not in the forge.
**Why:** It is a personal view of the workspace, differs per screen, and changes constantly while dragging.
**Tradeoff:** The arrangement doesn't follow a person to another browser or device.

### 7. Diffs are made from whole files

**Decision:** A diff window gets both versions of the file (at the fork point and now) and works out the diff itself, instead of being handed a patch.
**Why:** A patch only carries a few lines around each change, so there would be nothing to expand into. With both versions, any amount of context is one click away.
**Tradeoff:** Two whole files travel to the browser for every diff. Files that are binary or very large are not shown at all.

### 8. Shells start only on request

**Decision:** Opening a workspace never starts a shell; only opening a terminal does.
**Why:** A shell is the user's own process in a directory agents write to (ADR-003). It should exist only when someone wants it.
**Tradeoff:** After a daemon restart the terminals are gone, tabs and all, and have to be opened again.

### 9. Archiving keeps the branch and the conversation

**Decision:** Archiving removes the worktree and hides the workspace, and nothing else.
**Why:** The worktree is the part that costs disk space and clutters; the branch may still be wanted, and the conversation is the record of what was done.
**Tradeoff:** Branches accumulate until someone deletes them. There is no way yet to bring an archived workspace back.

### 10. Changes and terminals are live, not recorded

**Decision:** Neither changes nor terminal output become part of the workspace's history.
**Why:** See ADR-003.
**Tradeoff:** Both need a connected daemon, and terminal history doesn't survive a daemon restart.

## Related

- **ADRs:** ADR-001, ADR-002, ADR-003, ADR-006
- **FDRs:** FDR-002, FDR-003

## Open Questions

- More window types: files, previews.
- Restoring an archived workspace, and deleting its branch along with it.
