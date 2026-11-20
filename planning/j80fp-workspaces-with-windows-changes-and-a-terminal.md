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

Terminal links follow-up (2026-11-17): added xterm web links support for clickable HTTP and HTTPS URLs, including local servers and wrapped URLs. Links open in a separate browser tab or the desktop app’s default browser. Added a Storybook example and a release note.

Terminal focus follow-up: terminals opened with + now receive keyboard focus once xterm is ready. The initial terminal leaves focus unchanged. Browser stories verify both cases. Verification: `pnpm check`, `pnpm lint`, `pnpm test`, and `sweet doctor` pass.

Sidebar resize follow-up: navigation can grow to 720 pixels in a wide window. The conversation keeps at least half of the workspace beside it, including when the browser restores a saved layout.

Right-panel tab follow-up: double-clicking a tab in either right panel moves it beside the conversation and selects it. Verified both panels and persistence after reload in the browser.
