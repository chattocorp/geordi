# FDR-008: Notifications

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

Agents work for minutes at a time, and people do other things meanwhile. Geordi tells them when a workspace needs them, so that they don't have to watch it: a system notification, a short and quiet sound, and the workspace in bold in the sidebar until they have looked at it, counted on the Dock.

## Behavior

- When a workspace's agents stop working, because the turn ended or failed, Geordi shows a system notification titled with what happened ("Agent finished", or "Agent ran into a problem") and the workspace's title below it, and plays two soft notes: rising when it is done, falling when it failed.
- This counts the agents working alongside a workspace (FDR-002) as well: it tells when all of them have stopped, not when each one does.
- Nothing fires for the workspace the person is looking at. "Looking at" means its page is open and Geordi's window or tab is in front. With the window behind another app, or the tab hidden, the workspace on screen notifies too.
- Clicking the notification brings Geordi to the front and opens the workspace.
- A workspace someone was told about shows in bold in the sidebar until they open it. Opening it also takes its notification away.
- The desktop app's Dock icon shows how many workspaces are unread in this way. (So does an installed web app's icon, where the browser allows it.)
- No notification for a turn someone stopped, or for a message that steers the agent: they know. No notification between a turn and a waiting message it goes straight on to.
- A workspace started by an agent notifies only once that agent has stopped working too. While its agent is waiting for it, the reply goes to the agent, not the person.
- Geordi asks the browser's permission the first time the person sends something to an agent (or turns notifications on). Where the browser refuses, or has no notifications (a forge not served over HTTPS or localhost), the sound and the bold still work, and Settings says so.
- **Settings → Notifications** turns all of it (notification, sound, bold and Dock count) on or off for this browser. It is on by default.
- "Send a test" there shows a notification and plays the sound at once, and says what came of it: sent, not allowed, or not to be had. A notification that was sent and did not show is held back by the system (its own settings, a focus mode), which Geordi cannot tell.
- In the desktop app, notifications are the system's own.

## Design Decisions

### 0. In the desktop app, the system plays the sound

**Decision:** In the desktop app, notifications are the app's own (shown by its main process, not by the page), and their sound is a file in the app that the system plays with them: Geordi's two notes, rising for done and falling for failed. The app plays no sound itself. In a browser, notifications are silent and the page plays the notes.
**Why:** On macOS, sound an app plays itself (through the browser's audio engine, or a player it starts) goes through the system's audio daemon, which checks whether the app may use the microphone wherever sound goes out through a device that also takes it in. The person is then asked for the microphone by an app that never listens. A notification's sound is the system's to play, and asks for nothing.
**Tradeoff:** In the app there is no sound where its notifications are not allowed, and a second way of showing notifications to keep working.

### 1. Only when the agents stop

**Decision:** Turn ended and turn failed notify. Checks failing, pull requests being merged and other upstream changes don't.
**Why:** The agent stopping is the moment the person is needed. Everything else either happens while an agent works, and the agent will deal with it, or is something the person did. Fewer notifications get read.
**Tradeoff:** A check that fails long after the agent finished goes unannounced.

### 2. Worked out in the browser

**Decision:** The forge's sidebar data says how each workspace's work came to rest, derived from the event log. The browser notices when that changes while it is open, and tells.
**Why:** Notifications are for whoever is at a screen. Nothing new needs to run in the daemon or be stored (ADR-001, ADR-003), and a forge restart changes nothing about what has been told.
**Tradeoff:** Nothing is told while no Geordi window is open. Two open tabs both play the sound (the notification itself shows once).

### 3. One switch

**Decision:** One on/off setting covers notification, sound, bold and Dock count. It is kept in this browser (FDR-005).
**Why:** Some places need silence. Separate switches for sound and notification would be freedom nobody asked for; the system's own notification settings are there for more.
**Tradeoff:** Someone who wants the notification without the sound has to turn the sound off for the whole browser or app.

### 4. A sound made, not loaded

**Decision:** The two notes are made on the spot by the browser, instead of coming from a sound file. The system's own notification sound is turned off.
**Why:** No file to load or ship, and the same quiet sound everywhere, in the browser and the desktop app.
**Tradeoff:** Two sine tones are all it can be.

### 5. Unread, until looked at

**Decision:** Only the workspaces Geordi notified about are unread, and only until they are opened. The sidebar shows them in bold; the Dock counts them. The sidebar has no count of its own.
**Why:** It answers "which one was it?" after a notification has gone, and the Dock says from anywhere on the computer that something is waiting, without opening Geordi. In the sidebar, where the workspaces are listed, a count would say less than the list.
**Tradeoff:** What is unread belongs to the browser; another screen doesn't know it.

## Related

- **ADRs:** ADR-001, ADR-003, ADR-008
- **FDRs:** FDR-001, FDR-002, FDR-005
