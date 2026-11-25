---
data:
  priority: normal
  status: done
  type: feature
id: 81vp9
title: Show planned versions beside the sidebar merge action
---
The sidebar shows one next-version pill per package as soon as a workspace-added note has a known bump, including while work is in progress or before a pull request exists. Single-package repositories show the version alone. Multi-package repositories include the package name when available, even if this workspace changes only one package. Unnamed packages show only their version. Selecting a pill opens the workspace’s Changeset tab. The shared ValueBadge component uses the same pill height and shape as the adjacent action. Verified the pills in Chromium and the live version list against a multi-package Sweet Release worktree.