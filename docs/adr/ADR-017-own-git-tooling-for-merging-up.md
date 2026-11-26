# ADR-017: Our own Git tooling for merging up the outline

**Date:** 2026-11-26

## Context

In the outline, work merges up (FDR-018): a workspace's branch starts from its parent's, is merged into it when done, and only the top of a tree is merged into the repository's main line. That takes three Git operations Geordi doesn't do yet: starting a branch from another workspace's branch, merging a child's branch into its parent's, and moving a branch onto another base when its workspace is moved in the outline.

Tools exist for stacked branches, and we considered them:

- **jj (Jujutsu).** Rewriting a commit rebases everything built on it, and conflicts are kept in commits instead of stopping a rebase, so restacking never blocks. But agents and people use `git`, which colocated jj only tolerates; jj's working copies don't map onto our Git worktrees; it puts a `.jj` folder into the person's repositories; and we would have to ship it.
- **GitButler.** Many branches applied at once in one working directory: the opposite of a worktree per workspace.
- **Stacking tools** (git-town, git-branchless, Graphite's `gt`, spr). They restack for you, but assume one checkout: Git won't move a branch checked out in another worktree (`rebase --update-refs` leaves those out), and every workspace's branch is checked out in its own worktree. Graphite is also a hosted service.

## Decision

- **Geordi does it with plain Git, in the daemon** (ADR-002), through `gitIn` like all its Git: no other tool, nothing installed, nothing written into the repository beyond ordinary commits and branches.
- **Where things stand is read from Git, not recorded.** A workspace's base is the current branch of its parent's worktree (FDR-018), looked up when needed, so renamed branches need nothing. A child is merged up when its branch's tip is part of its parent's branch, however that came about: Geordi's action, an agent, a person in a terminal, or a pull request merged upstream.
- **What Geordi does keep is where a branch left its parent:** the commit a workspace's branch was started from, or last moved onto. Moving a branch takes only its own commits (`rebase --onto`), and after the parent has been rewritten (rebased, squash-merged), Git can no longer find that point by itself. It is used only while it is still in the branch's history; otherwise the most recent commit shared with the parent stands in, and where that isn't certain either, the workspace asks where its work starts.
- **Each operation runs in the worktree whose branch it changes**, and only while nobody works there: no agent's turn, no other operation. Merging up runs in the parent's worktree; moving a branch, in the child's. Git's own lock stops it if a person is running Git there at the same moment, and Geordi says so rather than retrying.
- **Conflicts are an agent's to resolve.** A merge or rebase that conflicts is aborted, leaving the worktree as it was, and the workspace offers the agent the work ("Resolve conflicts", FDR-003).

## Consequences

- People and agents keep using `git` as always, in terminals and in turns; whatever they do, Geordi shows as it is.
- We write and maintain the operations ourselves: few, and plain Git, but with their edge cases (a parent rewritten by hand, a branch deleted, a merge already done elsewhere) ours to handle.
- Restacking can stop at a conflict where jj would carry on; here the agent resolves it, which suits how Geordi works anyway.
- If jj comes to handle separate working copies and git-only users well, it could take over moving branches later; nothing in this decision is in its way.
