---
data:
  priority: low
  status: todo
  type: task
id: yaj11
title: Cache the icon lookup of repository sections
---
`withIcons` (`apps/daemon/src/icon.ts`) runs `git ls-files` over the sections' directories each time the daemon reads a workspace's configuration (`configFor` in `main.ts`), which happens on every change in the worktree. It is fast, but in a very large repository, with an agent at work, it adds up.

Keep what it found per worktree, and ask again only when it can have changed: `HEAD`, the index, or `.geordi.yml` (its sections).

Follows `wy0wt`.