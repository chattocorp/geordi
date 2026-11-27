---
data:
  priority: normal
  status: todo
  tags:
    - outline
    - git
    - deferred
  type: feature
id: cf5rr
title: Merging up the outline (FDR-018, ADR-017)
---
Implement FDR-018 (`docs/fdr/FDR-018-merging-up.md`) with our own Git tooling (ADR-017). Builds on the outline (`9db62`).

**Deferred (2026-11-27):** set aside to keep Geordi simple; on top of the outline it asks people to follow Git and the outline at once. Pick it up only if real use asks for children going back into their lead. The complete implementation is on the branch `geordi/merging-up` (commit `fb19d81a`), not merged.

## What is on `geordi/merging-up`

- A workspace started (or moved) under another of its repository is marked `mergesUp`, and builds on that one's local branch (`localBase` on the `WorktreeRef`). Its changes, "landed" and "Sync" follow from it; the Changes pane names it, unpickable.
- "Merge up" (`merge-up` action, `mergeUp` in `app.ts`): the daemon's `update` merges the child's branch into the parent's worktree where Git can; otherwise the parent's agent is asked. A parent with work under it not merged up has its landing actions unavailable.
- Moving a workspace moves its own commits onto its new base (`rebase` in the daemon, `rebaseWorktree`), or asks its agent. Where its work left the old base is found with `merge-base`.
- The child's agent is told where its work goes; `start_agent`'s description says so.
- Tried in the dev app without agents: merging up, and moving a child out of its lead's tree.

## Open, if it comes back

- Whether it works better than a pull request per child, in real work with agents: the first thing to find out.
- A child doesn't see its parent's uncommitted work: start from a snapshot of it and follow the parent's commits, with a recorded branch-off point (ADR-017; jj 0.46 doesn't do it with plain Git, see the spike there).
- A drag rewriting Git history: ask first, or make it an action.
