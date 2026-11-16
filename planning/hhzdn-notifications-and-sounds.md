---
data:
  priority: normal
  status: done
  type: feature
id: hhzdn
title: Notifications and sounds
---
Tell the person when a workspace needs them, without making them watch it.

## Acceptance criteria

- A finished turn in a workspace not in view produces a notification and a sound.
- Clicking the notification opens that workspace.
- Nothing fires for the workspace being looked at.

## Outcome

Built as designed in FDR-008:

- When a workspace's agents (including those working alongside it) stop because the turn ended or failed, and the person isn't looking at it (its page in front, window focused), they get a system notification, two soft synthesized notes (rising for done, falling for failed), and the workspace in bold in the sidebar until they open it. Clicking the notification focuses Geordi and opens the workspace.
- No notification for stopped or steered turns, for the gap between a turn and a queued message, or for an agent-started workspace while the agent that started it is still working.
- Derived in the browser from the sidebar's live query: the projection now records how each workspace's latest turn ended (`lastTurn`). Nothing new runs in the daemon.
- One switch, Settings → General → Notifications (per browser, on by default). Permission is asked on the first form submit (sending to an agent) or when the switch is turned on.
- Decided against: checks/PR events, a Dock badge or count, a sound file.
- Known limits: nothing is told with no Geordi window open; two open tabs both play the sound.