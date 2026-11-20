# FDR-005: Settings

**Status:** Active
**Last reviewed:** 2026-11-20

## Overview

One place for what is set up once and then left alone: how Geordi looks, and which repositories it knows. It keeps such things out of the sidebar, which is for the work at hand.

## Behavior

- Settings are a page of their own, in the main content area beside the sidebar, at `/settings/<section>`. Cmd+, (Ctrl+, elsewhere than on a Mac) opens it, as does "Settings" at the foot of the sidebar (marked while one is there) and, in the desktop app, "Settings…" in the app menu. One leaves it as any other page.
- It has sections, listed on its left, each at an address of its own, and opens where it was left. The sections are General, Notifications, Keyboard, Repositories, Agent access and About.
- **General** holds the theme: System (follows the computer's setting, also while it changes), Light, or Dark. The choice belongs to the browser.
- **Keyboard** lists the keyboard shortcuts, by group, as they are pressed on this platform. They are all defined in one place (`@geordi/ui/keys`), which is what the page lists: a new shortcut shows there by being added.
- **Notifications** turns telling of finished agents on or off (FDR-008), and sends a test: a notification and the sound, as when an agent is done, with a word on what came of it and where to look if nothing showed.
- **Repositories** lists the repositories Geordi knows, with their paths and how many workspaces are in use in each. A path to a Git repository on the machine adds one; a path Geordi can't make sense of is refused with the reason, on the page.
- A repository without workspaces in use can be removed. That only makes Geordi forget it: nothing on disk changes, and adding it again brings it back. One with workspaces can't be removed until they are archived.
- **Agent access** issues and revokes named MCP tokens, each for the repositories chosen with checkboxes (All and None only change the choice; repositories added later are never included). Settings shows a new token once, with the URL to use in the client (FDR-002).
- **About** describes Geordi and shows the running release version.
- Where there are no repositories yet, the new-workspace page says so and opens the settings at Repositories.
- Select a repository name or icon in the sidebar to fold or expand its workspaces. A folded group shows its workspace count. The browser remembers which groups are folded.

## Design Decisions

### 1. A page, not a dialog

**Decision:** Settings are a page of their own, in the main content area, with the sidebar beside them. (They were a dialog at first.)
**Why:** A dialog felt cramped and stood apart from the rest of Geordi. A page has room, an address for each section, and is left the way every other page is: back, or anything in the sidebar.
**Tradeoff:** Opening them leaves the page one was on; back returns to it.

### 2. Two kinds of setting, kept where each belongs

**Decision:** What is a preference of the person at this browser (the theme) lives in the browser's storage. What belongs to the installation (its repositories) is events, like all other state (ADR-001).
**Why:** A theme shouldn't follow you to another screen, and a repository shouldn't exist in one browser only.
**Tradeoff:** The page doesn't say which is which.

### 3. Removing a repository waits for its workspaces

**Decision:** A repository with workspaces in use can't be removed; the page says to archive them first.
**Why:** Its agents work in worktrees of it. Taking those along silently could lose work, which archiving a workspace already guards against, one workspace at a time.
**Tradeoff:** Removing a busy repository takes several steps.

### 4. Update preferences belong to the installed app

Signed macOS releases check for stable updates at startup and hourly. **Settings → About** shows update status and lets the person check for updates or choose Stable or Beta. Its setting persists across releases. Choosing Stable keeps
the installed version until a newer stable release is available. Builds installed from source
stay on the developer's chosen revision.

After downloading an update, About shows its version and a **Restart to update** button. People choose the time because restarting ends terminal sessions
and jobs. Detached agent turns continue.
