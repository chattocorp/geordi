---
data:
  priority: normal
  status: canceled
  tags:
    - agents
    - ui
  type: feature
id: gt21d
title: A repository's own, persistent workspace
---
Each repository gets a workspace that is always there, "Home": the first entry under the repository's name in the sidebar. It works in the repository's own checkout, on whatever branch is checked out, and can't be archived. See FDR-009.

## Outcome

Done (FDR-009):

- `home` workspaces in the forge, made when a repository is added and for every repository when a daemon connects. A sidebar entry like the others, pinned first, without archiving or continuing. The repository's name is a heading, no link; the page listing a repository's workspaces is gone.
- The daemon works in the checkout as it is (`WorktreeRef.home`, `homeWorktree`): no worktree, setup, teardown, continuing or removal.
- Own actions: Commit, Push, Update. Conversation can be cleared (`workspace.cleared`).
- Agents started from it with their own worktree branch off the upstream's main branch.
- Removing a repository retires its own workspace.

Open: pull request actions when the checkout is on a branch with one; reading cleared conversations; choosing another agent for it after it was made (further conversations can use any).

Canceled: removed again on 2026-11-17 (see FDR-009, Withdrawn). Workspaces work in worktrees of their own only.
