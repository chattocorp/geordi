# FDR-018: Merging up the outline

**Status:** Planned (deferred)
**Last reviewed:** 2026-11-27

> **Deferred (2026-11-27).** Set aside to keep Geordi simple: on top of the outline, it asks people to follow Git and the outline at once. Workspaces stay independent work with pull requests of their own; a lead that wants a child to build on its branch names it (`base`, FDR-002). A complete implementation (merging up, the parent waiting for its children, and moving a workspace's work along when it is moved) is kept on the branch `geordi/merging-up`, for when real use asks for it.

## Overview

Work in the outline (FDR-017) merges up, as an outline is completed from its leaves: a workspace under another workspace of the same repository builds on its parent's branch and is merged into it when done, and only the workspace at the top of a tree is merged into the repository's main line. The outline then shows what still has to land, and where, before a piece of work is finished.

When this ships, it changes FDR-001's decision that a worktree's base never follows the branches of the workspaces above it.

## Behavior

### Where a workspace's work starts

- A workspace's base is the branch of the nearest workspace above it in the outline that is in the same repository. Where there is none (it is at the top, under items without workspaces only, or under workspaces of other repositories only), its base is the repository's, as before (FDR-001).
- A child's branch starts from its parent's branch as it is when the child is made, and its changes are shown against its parent's branch.
- Every child in the same repository merges into its parent; there is no exception to choose. Work that is to go to the main line by itself isn't nested under a workspace of its repository.

### Merging up

- A child that is done is merged into its parent's branch, not into the main line. Its ribbon offers "Merge into _parent_" (FDR-003).
- A merge without conflicts is made by Geordi, in the parent's worktree, while nobody works there. One with conflicts goes to the parent's agent, which is the one integrating.
- A child needs no pull request. It may have one, against its parent's branch; merged there, it counts as merged up like any other.
- A child counts as merged up when its work is in its parent's branch, however it got there: by the action, by an agent, by a person in a terminal, or by a pull request.
- A merged-up child is done: its item is ticked off when its workspace is archived, as any other (FDR-017).

### What still has to land

- A workspace with children that aren't merged up yet says so ("2 not merged up") and doesn't offer to merge itself, or its pull request, until they are.
- Only the top of a tree is merged into the main line, by its pull request or locally, as today.

### Moving a workspace

- Moving a workspace in the outline can change its base (FDR-016): under a workspace of the same repository, its base becomes that one's branch; out of one, the repository's.
- Its branch is then moved onto the new base, taking only its own commits. Without conflicts, Geordi does it while nobody works there; with conflicts, its agent is asked to resolve them. While a move is pending, the workspace says so, and the drop shows where its work will be moved to.
- Work it needed from its old parent that isn't on the new base leaves it conflicted or failing, which then shows. Moving is never refused for that.

### Git as usual

- People and agents use `git` as always, in a terminal and in turns. Whatever they do, merging by hand included, the outline shows as it is (ADR-017).
- Where a branch's history was rewritten by hand and Geordi can't tell where its own work begins, the workspace asks where it starts, instead of guessing.

## Design Decisions

### 1. Children merge into their parent

**Decision:** Integration, not stacking: a child's work lands in its parent's branch, the parent's in the main line.
**Why:** It is how an outline is completed: the leaves first, then what they belong to. It is how a lead works (FDR-002): it hands out work and integrates it. And merging into a branch rewrites no history, where a stack rebases every layer each time one below it lands.
**Tradeoff:** A child's work reaches the main line only with its parent's, so a child that turns out to stand alone has to be moved out (and its branch moved) to land by itself.

### 2. One rule for every child in a repository

**Decision:** Every workspace under another of the same repository merges into it. Nesting is the choice; there is no per-child setting.
**Why:** The outline must mean one thing. Geordi prefers one fixed way to an option, and independent work has a natural place: not under a workspace of its repository.
**Tradeoff:** Parallel work a lead wants to send to the main line separately must sit beside the lead, not under it, which shows less of who started it.

### 3. Geordi merges what merges cleanly; agents resolve the rest

**Decision:** A clean merge up, or a clean move of a branch, is done by Geordi; a conflicted one by an agent: the parent's when merging up, the moved workspace's when moving.
**Why:** Most merges are clean and need nobody. Resolving conflicts is judgement about code, which agents are good at, and the one integrating should make it.
**Tradeoff:** Geordi changes branches in worktrees by itself, though only while nobody works in them, and only as far as Git does it without a conflict.

### 4. Pull requests are optional below the top

**Decision:** A child needs no pull request to merge up; it may have one, against its parent's branch.
**Why:** Most children are steps of one piece of work, reviewed as that piece of work in the top's pull request. Some deserve a review of their own, and then they have it.
**Tradeoff:** A child merged locally is never seen on its own upstream; its work is reviewed only as part of its parent's.

### 5. Read from Git, not recorded

**Decision:** Bases and whether a child is merged up are read from Git when needed; only where each branch left its parent is kept (ADR-017).
**Why:** People and agents use Git directly, and the outline must show what is true, however it happened.
**Tradeoff:** History rewritten by hand can leave Geordi unsure where a branch's own work starts; then it asks.

## Gates

- Merging up and moving branches apply within one repository; workspaces under workspaces of other repositories keep the repository's base.

## Related

- **ADRs:** ADR-002, ADR-006, ADR-016, ADR-017
- **FDRs:** FDR-001, FDR-002, FDR-003, FDR-016, FDR-017

## Open Questions

- Whether a lead's agent should be told when a child has been merged into its branch (it may want to build on it), or only see it in its branch.
- What the outline shows of how far a whole tree is from landing (a count per tree, a mark on each child).
