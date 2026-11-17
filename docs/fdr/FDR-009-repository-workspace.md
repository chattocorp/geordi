# FDR-009: The repository's own workspace

**Status:** Withdrawn
**Last reviewed:** 2026-11-17

## Withdrawn

Removed again the same day: a workspace that lives in the repository's checkout was confusing to use next to the others, and Geordi is back to workspaces in worktrees of their own only. Event logs that recorded Home workspaces are read without them (`legacy.ts`); what one started in a worktree of its own stays, without a parent.

## Overview

Every repository has one workspace that is always there: the repository's own. It works in the repository's checkout itself, on whatever branch is checked out there, instead of in a worktree on a branch of its own. It is the first entry under the repository's name, called "Home", and people use it for what doesn't deserve a branch: questions about the code, pulling, releasing, chores, running the project as it stands, and sending agents off to do the rest.

## Behavior

- It is the first of the repository's workspaces in the sidebar, there from the moment the repository is added, and works there as the others do: it shows when its agent is at work, how its work stands, and when it has come to rest unseen. Only archiving and continuing are not offered for it.
- It has everything a workspace has (FDR-001): a conversation with an agent, further conversations beside it, changes, diffs, terminals, the repository's jobs and links (FDR-006), its changeset (FDR-007), its own ports.
- It works in the repository's checkout, as it is: on the branch checked out there, with whatever is uncommitted there. Geordi never switches that branch; the workspace shows the one it is on, and follows when it changes.
- It is called "Home" in every repository, and keeps that name.
- It can't be archived, and it can't be continued on a new branch. It goes when the repository is removed from Geordi, which changes nothing on disk.
- Its agent is told where it is: in the person's own checkout, where nothing is isolated. It leaves alone what it didn't change, and commits, pushes and switches branches only when asked to.
- **Changes** shows what the checkout has that the upstream's main branch has not: uncommitted work and commits not pushed there.
- The top bar says less than in other workspaces (FDR-003), as there is no pull request to work towards: uncommitted changes with **Commit**, commits that are not pushed with **Push**, and **Update** when the upstream's main branch has moved on. A branch's pull request is linked if it has one.
- **Clear conversation** starts the conversation afresh: what was said is gone from view, and the agent starts without remembering it. Everything else stays as it is: files, terminals, running jobs, the other conversations. Not while the agent is at work.
- No setup script runs for it, and no teardown: nothing is made, and nothing removed.
- A workspace its agent starts (FDR-002) with a worktree of its own starts where every workspace does: from the upstream's main branch, not from what the checkout is on. An agent started to work alongside works in the checkout too.
- The repository's page, a list of its workspaces, is gone: the sidebar has that list. A repository's name there is a heading, and leads nowhere.

## Design Decisions

### 1. A workspace like any other, in another place

**Decision:** The repository's workspace is a workspace whose directory is the repository's checkout. Nothing else about it is a thing of its own.
**Why:** Everything a workspace can do then works there without being built again, and people have one thing to learn.
**Tradeoff:** What assumes a branch of its own (pull request actions, archiving, continuing) has to be told apart, case by case.

### 2. No isolation, and saying so

**Decision:** The agent works directly in the person's checkout, with its real Git metadata, and is told to tread carefully.
**Why:** That is the point: to work on what is there. A copy would be another worktree.
**Tradeoff:** An agent can touch the person's uncommitted work, commit to the main branch, and write the repository's Git configuration and hooks. The protections worktrees have against an agent rewiring its Git metadata don't apply here: the checkout is trusted as the person's own.

### 3. The checkout's branch, not the main branch

**Decision:** The workspace is on whatever the checkout is on. Geordi neither enforces nor restores the main branch.
**Why:** The checkout is the person's. Enforcing a branch would mean fighting them whenever they switch.
**Tradeoff:** "The repository's workspace" is not always "main". The top bar's simple actions are the same on any branch, so a feature branch checked out there gets no pull request actions.

### 4. Clearing instead of archiving

**Decision:** The conversation can be cleared in place; the workspace stays the same one.
**Why:** A workspace that never ends would otherwise carry a conversation that only grows. Replacing the workspace with a new one would end its terminals and jobs and change its ports, for the sake of a clean slate in the conversation alone.
**Tradeoff:** A cleared conversation can't be read again in Geordi.

### 5. An entry among the workspaces, and no repository page

**Decision:** The repository's workspace is a sidebar entry like any other, pinned first. The repository's name is a heading, not a link, and there is no page listing a repository's workspaces.
**Why:** An entry shows everything a workspace has to show (at work, how it stands, unread) in the place people already look for it. The name doing that as well made the heading busy, and two kinds of thing to click.
**Tradeoff:** One more row per repository, also in repositories nothing is going on in. No place for things about a repository that are not work in it; its settings are in Settings (FDR-005).

## Related

- **ADRs:** ADR-001, ADR-002, ADR-003
- **FDRs:** FDR-001, FDR-002, FDR-003, FDR-006

## Open Questions

- Pull request actions when the checkout is on a branch with one.
- Reading cleared conversations again.
