---
data:
  priority: normal
  status: done
  type: feature
id: 81vp9
title: Show planned versions beside the sidebar merge action
---
The green sidebar merge action shows one next-version pill per package with a workspace-added note and a known bump, even while the button is collapsed. Each pill displays a muted package name beside the emphasized version when available. Unnamed packages show only their version. The shared ValueBadge component uses the same pill height and shape as the adjacent action. Verified the pills in Chromium and the live version list against a multi-package Sweet Release worktree.