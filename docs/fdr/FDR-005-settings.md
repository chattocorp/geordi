# FDR-005: Settings

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

One place for what is set up once and then left alone: how Geordi looks, and which repositories it knows. It keeps such things out of the sidebar, which is for the work at hand.

## Behavior

- Settings are a dialog over whatever page one is on. Cmd+, (Ctrl+, elsewhere than on a Mac) opens it, as does "Settings" at the foot of the sidebar and, in the desktop app, "Settings…" in the app menu. Escape, a click beside it, or its close button closes it.
- It has sections, listed on its left, and opens where it was left. For now: General and Repositories.
- **General** holds the theme: System (follows the computer's setting, also while it changes), Light, or Dark. The choice belongs to the browser.
- **Repositories** lists the repositories Geordi knows, with their paths and how many workspaces are in use in each. A path to a Git repository on the machine adds one; a path Geordi can't make sense of is refused with the reason, in the dialog.
- A repository without workspaces in use can be removed. That only makes Geordi forget it: nothing on disk changes, and adding it again brings it back. One with workspaces can't be removed until they are archived.
- Where there are no repositories yet, the overview and the new-workspace page say so and open the settings at Repositories.
- The sidebar no longer lists repositories. They are on the overview, and each workspace in the sidebar names its repository.

## Design Decisions

### 1. A dialog, not a page

**Decision:** Settings open over the current page instead of being a page of their own.
**Why:** One looks something up or changes it and carries on; the conversation or diff one was in stays where it was. It is also what Cmd+, does everywhere else.
**Tradeoff:** No address to link to a setting with, and room for only so much per section.

### 2. Two kinds of setting, kept where each belongs

**Decision:** What is a preference of the person at this browser (the theme) lives in the browser's storage. What belongs to the installation (its repositories) is events, like all other state (ADR-001).
**Why:** A theme shouldn't follow you to another screen, and a repository shouldn't exist in one browser only.
**Tradeoff:** The dialog doesn't say which is which.

### 3. Removing a repository waits for its workspaces

**Decision:** A repository with workspaces in use can't be removed; the dialog says to archive them first.
**Why:** Its agents work in worktrees of it. Taking those along silently could lose work, which archiving a workspace already guards against, one workspace at a time.
**Tradeoff:** Removing a busy repository takes several steps.
