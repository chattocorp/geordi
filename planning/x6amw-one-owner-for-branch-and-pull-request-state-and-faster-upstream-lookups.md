---
data:
  priority: normal
  status: done
  type: task
id: x6amw
title: One owner for branch and pull request state, and faster upstream lookups
---
From a review of how branch / pull request state is read and shown.

Outcome (branch `geordi/upstream-state-sync`):

- Forge: `standings.ts` is the one place a worktree's standing is kept, for the sidebar and open workspaces. Local Git and the upstream forge are asked separately. `watchers.ts` only adds configuration and release plan. `upstream-refresh.ts` is gone.
- Daemon: an invalidating action (merge, auto-merge, ready) and a push force a reread; unknown mergeability keeps what was known; first lookups on GitHub use one batched GraphQL request instead of search; rate-limit pauses are per host and bucket; failed lookups are logged once; concurrent lookups are shared.
- UI: a quiet sign beside the ribbon when the forge cannot be asked.

Left as is: `mergedPull` in `WorkspaceView.svelte` (harmless now); `upstream()` still runs a few git commands before its cache check.
