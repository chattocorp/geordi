# FDR-012: The Desk

**Status:** Experimental
**Last reviewed:** 2026-11-18

## Overview

The Desk is Geordi's one workspace that belongs to no repository. From it, an agent orchestrates Geordi for the person: they tell it what they want, and it starts agents in whichever repositories the work needs, supervises them, brings their results together and reports back. It is for orchestrating; it is not a general place to chat.

## Behavior

- The Desk is always in the sidebar, right below the overview. It shows when its agent is at work, when it asks something, and when it has come to rest unseen.
- Before anything is said there, the Desk is a box to say what should be done in, with the agent, model and effort to do it with (FDR-004). Once begun, it is a conversation like any other, whose reply box chooses the model and effort for what comes next.
- The Desk is a conversation and nothing else: no changes, diffs, changeset, terminals, jobs, links or ports, no pull request actions, no further conversations beside it.
- **Start afresh** ends the conversation: it is archived (and stays readable), the agent's process ends, and the next thing said at the Desk begins a new conversation that remembers nothing of the last. Not while its agent is at work.
- Its agent works in the Desk's own folder: not a Git repository, there for notes and anything it fetches. The folder stays when the Desk starts afresh; the agent is told to keep notes there that are worth having next time.
- The Desk's agent can do in Geordi what the person can (FDR-002): see every repository and workspace, start agents in any repository, and message, steer and stop any agent, whoever started it.
- What it starts begins in a worktree of its own, from the repository's main branch, and appears under that repository in the sidebar, marked as started by the Desk. Starting the Desk afresh leaves those agents alone; they carry on, without a parent.

## Design Decisions

### 1. One Desk, always there

**Decision:** There is one Desk, in a fixed place in the sidebar, rather than desks to start and archive.
**Why:** A fixed place to go is calmer than another list to keep tidy, and one orchestrator can run many agents at once. Geordi decides rather than offering a choice.
**Tradeoff:** Two unrelated efforts share one conversation, unless the person starts afresh between them.

### 2. Starting afresh instead of growing forever

**Decision:** The conversation is archived and a new one begins on the next message; the folder carries over.
**Why:** A conversation that only grows gets slow and confused. Archiving keeps the old one readable, and the folder lets the agent keep what is worth keeping.
**Tradeoff:** Its agent remembers only what it wrote down.

### 3. A kind of workspace of its own, and looking like one

**Decision:** The Desk is a workspace without a repository, with its own place and name, not a repository workspace with features switched off.
**Why:** The repository's own workspace (FDR-009) was withdrawn because it looked like the others and behaved differently. The Desk is different on sight.
**Tradeoff:** Workspace code that assumes a repository has to learn that a workspace may have none.

### 4. The person's reach

**Decision:** The Desk's agent may do in Geordi whatever the person may: across all repositories, and on any agent. The limits on nesting and on how many agents run at once still apply.
**Why:** The person is at the Desk with it, and it acts for them.
**Tradeoff:** It can interrupt or stop work it didn't start; it is told to do so only when asked. Agents in repository workspaces stay limited to their own repository and their own children.

### 5. What the Desk starts lives with its repository

**Decision:** Agents the Desk starts show under their repository, like any other work there; the Desk shows no list of them.
**Why:** Work on a repository is found under the repository. The agent says how things stand when asked.
**Tradeoff:** Nothing on screen gathers the Desk's agents in one place.

### 6. For orchestrating, not for chatting

**Decision:** The Desk is designed and described for orchestrating. It can be talked to about anything, but nothing is added for that.
**Why:** Geordi is an orchestrator; one clear purpose keeps the Desk calm and small.
**Tradeoff:** A quick question outside any repository gets a tool shaped for something else.

## Related

- **ADRs:** ADR-001, ADR-003, ADR-004
- **FDRs:** FDR-001, FDR-002, FDR-004, FDR-009
