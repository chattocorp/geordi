# FDR-012: Desks

**Status:** Active
**Last reviewed:** 2026-11-18

## Overview

A desk is a workspace that belongs to no repository. From it, an agent orchestrates Geordi for the person: they tell it what they want, and it starts agents in whichever repositories the work needs, supervises them, brings their results together and reports back. A desk is for orchestrating; it is not a general place to chat.

## Behavior

- Desks have a section of their own in the sidebar, above the repositories, with a way to start a new one there. Each shows what every workspace shows there: when its agent is at work, when it asks something, when it has come to rest unseen.
- There can be many desks, one per effort. A desk is archived when its work is done, like any workspace.
- A desk is a conversation with one agent, chosen with its model and effort as anywhere else (FDR-004), and nothing else.
- Its agent works in a folder of its own that Geordi makes for the desk: empty, not a Git repository, there for notes and anything it fetches. The folder is removed when the desk is archived.
- Its agent is told where it is: at a desk, with no repository, there to orchestrate rather than to write code itself.
- The desk's agent can do in Geordi what the person can (FDR-002): see every repository and workspace, start agents in any repository, and message, steer and stop any agent, whoever started it.
- What it starts begins in a worktree of its own, from the repository's main branch, and appears under that repository in the sidebar as usual, marked as started by the desk.
- A desk has none of what follows from a repository: no changes, diffs, changeset, jobs, links or ports, no pull request actions, no setup or teardown.
- Archiving a desk leaves the agents it started alone; they keep working and stay where they are, without a parent.

## Design Decisions

### 1. A kind of workspace of its own, and looking like one

**Decision:** A desk is a workspace without a repository, shown in its own section with its own name, not a repository workspace with features switched off.
**Why:** The repository's own workspace (FDR-009) was withdrawn because it looked like the others and behaved differently. A desk is different on sight, so nobody expects a branch or changes there.
**Tradeoff:** Workspace code that assumes a repository has to learn that a workspace may have none.

### 2. Just a conversation

**Decision:** A desk shows its conversation and nothing beside it: no list of the agents it started, no terminals.
**Why:** The simplest shape first. The agent can say how the work stands when asked, and the sidebar already shows every workspace under its repository.
**Tradeoff:** No overview of a desk's work at a glance; the person asks for one.

### 3. A folder of its own, never "no directory"

**Decision:** Every desk gets an empty folder owned by Geordi, and removed with the desk.
**Why:** Agents need a working directory. One per desk keeps desks from touching each other or anything of the person's, with nothing to set up.
**Tradeoff:** A desk's agent can't work on files the person has elsewhere, short of being told where they are.

### 4. The person's reach

**Decision:** A desk's agent may do in Geordi whatever the person may: across all repositories, and on any agent, not only those it started. The limits on nesting and on how many agents run at once still apply.
**Why:** The person is at the desk with it, and it acts for them. Rules about whose agent is whose would only stand between them and their own work.
**Tradeoff:** A desk can interrupt or stop work it didn't start. Agents in repository workspaces stay limited to their own repository and their own children.

### 5. What a desk starts lives with its repository

**Decision:** Agents a desk starts show under their repository in the sidebar, like any other work there.
**Why:** Work on a repository is found under the repository, whoever started it.
**Tradeoff:** Nothing on screen gathers a desk's agents in one place.

### 6. Many desks, archived when done

**Decision:** Desks are started and archived like other workspaces, rather than one permanent desk.
**Why:** One effort per desk keeps conversations short and focused, and avoids a conversation that only grows (FDR-009's clearing problem).
**Tradeoff:** Another list in the sidebar to keep tidy.

### 7. For orchestrating, not for chatting

**Decision:** Desks are designed and described for orchestrating. A desk can be talked to about anything, but nothing is added for that.
**Why:** Geordi is an orchestrator; a general chat is somebody else's product. One clear purpose keeps the desk calm and small.
**Tradeoff:** People who want a quick question answered outside any repository have a tool shaped for something else.

## Related

- **ADRs:** ADR-001, ADR-003, ADR-004
- **FDRs:** FDR-001, FDR-002, FDR-004, FDR-009
