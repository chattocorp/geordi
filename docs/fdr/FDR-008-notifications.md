# FDR-008: Notifications

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

Agents work for minutes at a time, and people do other things meanwhile. Geordi tells them when a workspace needs them, so that they don't have to watch it: a system notification, a short and quiet sound, and the workspace in bold in the sidebar until they have looked at it.

## Behavior

- When a workspace's agents stop working, because the turn ended or failed, Geordi shows a system notification with the workspace's title and whether the agent is done or ran into a problem, and plays two soft notes: rising when it is done, falling when it failed.
- This counts the agents working alongside a workspace (FDR-002) as well: it tells when all of them have stopped, not when each one does.
- Nothing fires for the workspace the person is looking at. "Looking at" means its page is open and Geordi's window or tab is in front. With the window behind another app, or the tab hidden, the workspace on screen notifies too.
- Clicking the notification brings Geordi to the front and opens the workspace.
- A workspace someone was told about shows in bold in the sidebar until they open it. Opening it also takes its notification away.
- No notification for a turn someone stopped, or for a message that steers the agent: they know. No notification between a turn and a waiting message it goes straight on to.
- A workspace started by an agent notifies only once that agent has stopped working too. While its agent is waiting for it, the reply goes to the agent, not the person.
- Geordi asks the browser's permission the first time the person sends something to an agent (or turns notifications on). Where the browser refuses, or has no notifications (a forge not served over HTTPS or localhost), the sound and the bold still work, and Settings says so.
- **Settings → General → Notifications** turns all of it (notification, sound and bold) on or off for this browser. It is on by default.
- In the desktop app, notifications are the system's own.

## Design Decisions

### 1. Only when the agents stop

**Decision:** Turn ended and turn failed notify. Checks failing, pull requests being merged and other upstream changes don't.
**Why:** The agent stopping is the moment the person is needed. Everything else either happens while an agent works, and the agent will deal with it, or is something the person did. Fewer notifications get read.
**Tradeoff:** A check that fails long after the agent finished goes unannounced.

### 2. Worked out in the browser

**Decision:** The forge's sidebar data says how each workspace's work came to rest, derived from the event log. The browser notices when that changes while it is open, and tells.
**Why:** Notifications are for whoever is at a screen. Nothing new needs to run in the daemon or be stored (ADR-001, ADR-003), and a forge restart changes nothing about what has been told.
**Tradeoff:** Nothing is told while no Geordi window is open. Two open tabs both play the sound (the notification itself shows once).

### 3. One switch

**Decision:** One on/off setting covers notification, sound and bold. It is kept in this browser (FDR-005).
**Why:** Some places need silence. Separate switches for sound and notification would be freedom nobody asked for; the system's own notification settings are there for more.
**Tradeoff:** Someone who wants the notification without the sound has to turn the sound off for the whole browser or app.

### 4. A sound made, not loaded

**Decision:** The two notes are made on the spot by the browser, instead of coming from a sound file. The system's own notification sound is turned off.
**Why:** No file to load or ship, and the same quiet sound everywhere, in the browser and the desktop app.
**Tradeoff:** Two sine tones are all it can be.

### 5. Unread, until looked at

**Decision:** The sidebar marks only the workspaces it notified about, and only until they are opened. There is no count, in the sidebar or on the Dock.
**Why:** It answers "which one was it?" after a notification has gone, without one more thing to read. A count says less than the list it counts.
**Tradeoff:** What is unread belongs to the browser; another screen doesn't know it.

## Related

- **ADRs:** ADR-001, ADR-003, ADR-008
- **FDRs:** FDR-001, FDR-002, FDR-005
