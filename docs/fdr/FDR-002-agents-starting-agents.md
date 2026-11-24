# FDR-002: Agents starting and supervising agents

**Status:** Active
**Last reviewed:** 2026-11-24

## Overview

An agent working in a workspace can start further agents, give them tasks, wait for them, read what they produced and stop them. This lets one agent act as a lead that splits up work, delegates and integrates, while people see at a glance who is controlling what.

## Behavior

- An agent can start another agent (of the same kind as itself, or another). The new agent is a workspace of its own, with its own conversation, and works in one of two places, as the parent decides each time:
  - **Its own worktree:** a new worktree and branch for parallel work, branched from the repository’s base (in the parent's repository, or another accessible one it selects), or from a branch the parent names (`base`), such as its own to build on its committed work.
  - **A shared worktree:** the parent can share its own directory or start a reviewer in its own worktree or in that of any of its descendants. A tool call with a parameter the tool does not know is refused. The reviewer sees uncommitted files and reports to the agent that started it.
- The parent can message a child, wait until it has finished its turn, read its latest reply, stop it, and archive it once it is done with it (after merging its branch, say). Archiving on an agent's behalf never discards uncommitted work. Children can start children of their own, up to a limit.
- Messages within a delegation steer the current turn so the recipient can use new information before it finishes. The sender can explicitly queue a follow-up for the next turn. Providers without live steering queue messages automatically (ADR-010). Incoming agent messages appear in left-aligned tinted bubbles. The sender’s workspace name links to its conversation. Messages from a child start collapsed so the parent’s summary stays in view. Select the sender and outcome to read the message inline, then select the workspace link to open its conversation.
- When a child ends a turn (completed or failed), its parent is told in a message from the child with its reply: the last message of that turn, which is its answer (the last 4000 characters of it, since an answer ends with its conclusion; what it said on the way is in its transcript), unless the parent is waiting for it with `wait_for_agent` at that moment. The report steers a working parent where the provider supports it. An idle parent starts a turn unless its messages are held after a failure. So a parent hands off work and ends its turn, without polling, and can't forget a child that finished.
- The parent can give the new agent's workspace a name when it starts it; otherwise the child names itself, like any workspace.
- Agents can find, read and wait on any workspace in the installation, in any repository, archived conversations included. A repository agent can message only its own descendants and the agent that started it, never another agent: work stays in the tree that was asked for it, and an agent can't set the person's other agents to work. A message to an idle agent starts a turn. A repository agent can stop and archive its own descendants.
- People can give an MCP client outside Geordi a named token in Settings (FDR-005), for the repositories they choose; it sees nothing of the others, nor of repositories added later. Such a client can start agents in those repositories, each a workspace of its own, as a person would start it, and supervise them like a parent. Messages to other busy agents wait for their current turn to end. Its messages are marked with its name.
- Work from a child with its own worktree is merged in the repository where the child worked. Geordi does not merge on its own.
- The sidebar groups current workspaces by repository. Archiving the last workspace in a repository removes its heading. A workspace started by an agent is marked as such, appears in its destination repository, and sits under its parent when both are in the same repository; pointing at it lights that one up.
- A child workspace shows changes against the branch it started from, like any workspace (FDR-001), until it has a pull request.
- An agent working in another workspace's directory is shown in that workspace, not beside it: as a conversation of its own next to the workspace's (a tab with its name, which turns while it works), and not in the sidebar or among the workspaces started. The workspace shows as working while any of its agents is. A link to such an agent leads to its conversation there. Closing the tab of one that is not working archives it. Once the workspace it worked in is archived, it stands for itself.
- People can add an agent to a workspace too: the "+" beside its conversations opens a new one, begun as a workspace is, by writing what to do and choosing who does it and how. The agent is there once that is sent, working in the same directory. It belongs to the workspace like one an agent started there, and goes when the workspace is archived.
- People can open, message and stop any child like any other workspace.
- Limits on nesting depth and on the number of children running at once stop runaway delegation; hitting one is reported to the calling agent as an error it can act on.
- Archiving follows children within the same repository and includes agents sharing each affected worktree. When a child works in another repository, it and its work can continue there.
- A worktree that several workspaces work in is only removed once the last of them is archived.

## Design Decisions

### 1. Both sharing and isolating are first-class

**Decision:** A child is always a workspace of its own; the parent chooses a new worktree or a shared one for each task.
**Why:** Reviewing needs the parent's uncommitted files, parallel implementation needs isolation. Neither default fits both.
**Tradeoff:** Agents sharing a worktree can step on each other's edits, and the lead has to choose well.

### 2. A child starts from the repository’s base unless told otherwise

**Decision:** A child starts from the repository’s base, like a workspace a person starts, unless the parent names another branch (`base`), its own for instance. That branch is the child's one base. The parent coordinates integration in each repository.
**Why:** Most children make pull requests of their own against the main line; a lead that wants a child to build on its work says so. Earlier, children always started from the parent's branch: a lead on a prototype branch handed its children that prototype, and they had to undo it by hand.
**Tradeoff:** A child that builds on its parent sees only what the parent has committed, and only when the parent asks for it.

### 3. Parentage is recorded, not declared

**Decision:** Who started a child is taken from who made the call.
**Why:** See ADR-004. The tree in the sidebar must be trustworthy.
**Tradeoff:** A child can't be re-parented or adopted later.

### 4. The sidebar groups current workspaces by repository

**Decision:** Show a repository heading while it has a workspace in the sidebar. Within each group, list child workspaces under their parent.
**Why:** Each heading helps the person find current work in that repository.
**Tradeoff:** To start work in an empty repository, the person selects it from New workspace.

## Gates

- Nesting depth limit (3 by default) and concurrent-children limit per agent (5 by default), both set by the person running the forge. A depth limit of 0 turns the feature off.

## Related

- **ADRs:** ADR-001, ADR-002, ADR-004, ADR-010
- **FDRs:** FDR-001, FDR-003

## Open Questions

- Whether a named "project" level above workspaces is needed, or the tree is enough.
- Budgets (tokens, time) per subtree rather than only counts.
