---
data:
  priority: normal
  status: todo
  type: feature
id: hhzdn
title: Notifications and sounds
---
Tell the person when a workspace needs them, without making them watch it.

## Ideas

- System notification (browser Notification API; native in the desktop app) when an agent finishes a turn, fails, or waits for input, and the workspace is not in view.
- A short, quiet sound for the same moments.
- Badge/dock count of workspaces that need attention (desktop app).

## Open questions

- Which events notify: turn ended, turn failed, checks failed, PR merged?
- Fixed behaviour vs. one on/off switch in Settings (FDR-005); stay opinionated.
- Derived from the event log and live state in the forge; nothing new runs in the daemon (ADR-003).

## Acceptance criteria

- A finished turn in a workspace not in view produces a notification and a sound.
- Clicking the notification opens that workspace.
- Nothing fires for the workspace being looked at.