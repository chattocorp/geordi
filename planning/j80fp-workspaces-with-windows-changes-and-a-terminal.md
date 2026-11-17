---
data:
  priority: high
  status: done
  tags:
    - agents
    - ui
  type: feature
id: j80fp
title: Workspaces with windows, changes and a terminal
---
Turn sessions into workspaces (FDR-001): a worktree on its own branch holding several agent sessions, shown as windows in a tabbed, splittable layout, with a sidebar for the workspace's total changes and a terminal in its directory.

Outcome: implemented. Sessions from before workspaces each become a workspace of their own. Changes and terminal I/O are live channels outside the event log (ADR-003). Follow-ups: 7ncxh (cleaning up worktrees), and a target branch per workspace once pull requests exist (h5hb5).

Terminal focus follow-up: terminals opened with + now receive keyboard focus once xterm is ready. The initial terminal leaves focus unchanged. Browser stories verify both cases. Verification: `pnpm check`, `pnpm lint`, `pnpm test`, and `sweet doctor` pass.
