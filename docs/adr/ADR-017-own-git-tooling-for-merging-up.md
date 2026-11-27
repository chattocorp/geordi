# ADR-017: Our own Git tooling for merging up the outline

**Date:** 2026-11-26

> **Deferred (2026-11-27)** with merging up (FDR-018), which it serves: not in use. It stands as the decision for when merging up comes back; the implementation is on the branch `geordi/merging-up`.

## Context

In the outline, work merges up (FDR-018): a workspace's branch starts from its parent's, is merged into it when done, and only the top of a tree is merged into the repository's main line. That takes three Git operations Geordi doesn't do yet: starting a branch from another workspace's branch, merging a child's branch into its parent's, and moving a branch onto another base when its workspace is moved in the outline.

Tools exist for stacked branches, and we considered them:

- **jj (Jujutsu).** Rewriting a commit rebases everything built on it, and conflicts are kept in commits instead of stopping a rebase, so restacking never blocks. But agents and people use `git`, which colocated jj only tolerates; jj's working copies don't map onto our Git worktrees; it puts a `.jj` folder into the person's repositories; and we would have to ship it.
- **GitButler.** Many branches applied at once in one working directory: the opposite of a worktree per workspace.
- **Stacking tools** (git-town, git-branchless, Graphite's `gt`, spr). They restack for you, but assume one checkout: Git won't move a branch checked out in another worktree (`rebase --update-refs` leaves those out), and every workspace's branch is checked out in its own worktree. Graphite is also a hosted service.

## Decision

- **Geordi does it with plain Git, in the daemon** (ADR-002), through `gitIn` like all its Git: no other tool, nothing installed, nothing written into the repository beyond ordinary commits and branches.
- **Where things stand is read from Git, not recorded.** A workspace's base is the current branch of its parent's worktree (FDR-018), looked up when needed, so renamed branches need nothing. A child is merged up when its branch's tip is part of its parent's branch, however that came about: Geordi's action, an agent, a person in a terminal, or a pull request merged upstream.
- **Where a branch left its old base is, for now, found when it moves** (the most recent commit it shares with that base), which holds while nobody rewrote that base. **What Geordi will keep, for when that isn't so, is where a branch left its parent:** the commit a workspace's branch was started from, or last moved onto. Moving a branch takes only its own commits (`rebase --onto`), and after the parent has been rewritten (rebased, squash-merged), Git can no longer find that point by itself. It is used only while it is still in the branch's history; otherwise the most recent commit shared with the parent stands in, and where that isn't certain either, the workspace asks where its work starts.
- **Each operation runs in the worktree whose branch it changes**, and only while nobody works there: no agent's turn, no other operation. Merging up runs in the parent's worktree; moving a branch, in the child's. Git's own lock stops it if a person is running Git there at the same moment, and Geordi says so rather than retrying.
- **Conflicts are an agent's to resolve.** A merge or rebase that conflicts is aborted, leaving the worktree as it was, and the workspace offers the agent the work ("Resolve conflicts", FDR-003).

## Consequences

- People and agents keep using `git` as always, in terminals and in turns; whatever they do, Geordi shows as it is.
- We write and maintain the operations ourselves: few, and plain Git, but with their edge cases (a parent rewritten by hand, a branch deleted, a merge already done elsewhere) ours to handle.
- Restacking can stop at a conflict where jj would carry on; here the agent resolves it, which suits how Geordi works anyway.
- If jj comes to handle separate working copies and git-only users well, it could take over moving branches later; nothing in this decision is in its way.

## Revisited: jj 0.46 (2026-11-26)

jj 0.46 (October 2026) makes each jj workspace a real Git worktree, which removed the objection that its working copies don't map onto ours. A spike in a scratch repository with two such workspaces, a lead and a child started from the lead's uncommitted work, found:

- Plain Git as our agents use it (`switch -c`, `commit`, `branch -m`, `push -u`) works in such a worktree while jj only looks on.
- jj does start a child from the lead's uncommitted work: it snapshots the lead's working copy as a commit.
- When the lead goes on, jj moves the child's commits onto the lead's new state, but only in its own model. Where jj hadn't taken in the child's Git commit yet, the lead's change became divergent (two versions), the child's commit left on the old one. Where it had, the child's worktree was taken off its branch (a detached `HEAD`) with stale files; after jj's `workspace update-stale` the files were right, but Git still had no branch: the next `git commit` lands beside it, and `git push -u origin HEAD` fails.

So jj's moving along works only where everyone in a worktree uses jj (agents with bookmarks instead of branches, people in their terminals, and the daemon's own Git work), and breaks with plain Git exactly when a child is moved onto its parent's work. People using Git normally in a workspace's terminal is a requirement, so this decision stands. What jj does there (start from a snapshot of the parent's working copy; move the child's own commits onto what comes next) Geordi does itself, at moments it chooses: only while nobody works in the child, with its branch kept checked out, and its files updated from outside.
