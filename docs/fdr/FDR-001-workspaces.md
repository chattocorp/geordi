# FDR-001: Workspaces

**Status:** Active
**Last reviewed:** 2026-11-14

## Overview

A workspace is where a piece of work happens: a Git worktree on its own branch in one repository, the agent sessions working in it, the changes they have made, and a terminal. People use it to run one or several agents on a task, watch what they change, and step in by hand.

## Behavior

- A workspace is started from a repository with a first prompt and an agent. It gets its own worktree and branch, and is named after the first line of that prompt.
- A workspace holds any number of agent sessions, with different agents if wanted. They all work in the same worktree and can run at the same time.
- The centre of the workspace is a window area. Each session is a window, shown as a tab.
  - Tabs can be dragged onto another group of tabs to move them, or towards an edge of a group to split it and place the window beside, above or below.
  - Splits are resized by dragging the line between them.
  - The "+" in a tab bar opens a window for starting a new session. It also lists sessions whose windows were closed, so they can be reopened.
  - Closing a window never ends or deletes a session.
- The sidebar on the right has two panes, resizable against each other and against the window area.
  - **Changes** lists every file that differs from where the workspace branched off, with lines added and removed: committed, uncommitted and untracked work alike. Selecting a file opens its diff as a window. The list keeps itself up to date.
  - Above the list, the pane shows how the workspace's branch stands on the forge the repository is hosted on: not pushed yet, pushed without a pull request (with a link to open one), or its pull request with state, checks, reviews and target branch, linking to the forge. It appears only for repositories hosted on a forge Geordi knows, and is at most a minute old.
  - **Terminals** are shells in the workspace's directory, as tabs that can be split like windows. None runs until asked for: a shell starts when a terminal is opened with "+", or on a key press in one that isn't running. Closing a terminal ends its shell. Terminals keep running while the page is closed and while the forge restarts, and show their recent output when the page is opened again.
- The window arrangement and pane sizes are remembered per browser.
- Sessions from before workspaces existed each appear as a workspace of their own.

## Design Decisions

### 1. The workspace owns the worktree; sessions share it

**Decision:** Worktree and branch belong to the workspace. Every session in it works in the same directory.
**Why:** The point of several windows is several agents (or an agent and a human) collaborating on one change, for example one implementing while another reviews.
**Tradeoff:** Sessions running at once can step on each other's edits. Isolation is achieved by starting another workspace.

### 2. A workspace always starts with a session

**Decision:** Creating a workspace takes a prompt and starts its first session right away.
**Why:** It keeps the flow from "I have a task" to "an agent is on it" to one step, and gives the workspace a name without asking for one.
**Tradeoff:** There are no empty workspaces for purely manual work.

### 3. Changes are measured against the fork point

**Decision:** The changes pane compares the working directory with the commit where the workspace's branch left the repository's checked-out branch.
**Why:** People want the workspace's total effect, regardless of whether an agent has committed yet.
**Tradeoff:** There is no notion of a target branch yet. If the repository's main checkout is on an unrelated branch, the comparison is against that.

### 4. A home-grown window layout

**Decision:** Tabs and splits are built in-house as a small tree of splits and tab groups, rather than with a docking library.
**Why:** The available libraries are large, bring their own look, and offer far more (floating windows, popouts) than is needed. The layout model is simple enough to own and test.
**Tradeoff:** No tab reordering within a group, floating windows or keyboard-driven docking for now.

### 5. Layout is a browser preference, not shared state

**Decision:** Which windows are open and how they are arranged is stored in the browser, not in the forge.
**Why:** It is a personal view of the workspace, differs per screen, and changes constantly while dragging.
**Tradeoff:** The arrangement doesn't follow a person to another browser or device.

### 6. Shells start only on request

**Decision:** Opening a workspace never starts a shell; only opening a terminal or pressing a key in a stopped one does.
**Why:** A shell is the user's own, unsandboxed process in a directory agents write to (ADR-003). It should exist only when someone wants it.
**Tradeoff:** After a daemon restart, remembered terminals wait for a key press instead of coming back by themselves.

### 7. Changes and terminal are live, not recorded

**Decision:** Neither changes nor terminal output become part of the workspace's history.
**Why:** See ADR-003.
**Tradeoff:** Both need a connected daemon, and terminal history doesn't survive a forge restart.

## Related

- **ADRs:** ADR-001, ADR-002, ADR-003, ADR-006

## Open Questions

- A target branch per workspace (and with it, pull requests) instead of the implicit fork point.
- Archiving or deleting workspaces, including their worktree and branch.
- More window types: files, a second terminal, previews.
