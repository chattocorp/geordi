# FDR-003: Workspace actions

**Status:** Active
**Last reviewed:** 2026-11-18

## Overview

The top bar of a workspace shows what could or should happen next: publish the work, fix what is failing, merge, archive. One click sets it in motion. People use it to move a workspace along without having to work out its state, or to phrase the same instructions again and again.

## Behavior

- The top bar says where the workspace stands in a few words ("Changes to publish", "Checks failing", "Ready to merge", "Merged"), coloured by how that should feel, with a link to the pull request if there is one, and the actions right beside it as one unit.
- The actions follow from where the workspace's changes and its pull request stand. The most pressing one is shown as the main action at the far right; other actions sit to its left.

  | When                                                                                                     | Action           |
  | -------------------------------------------------------------------------------------------------------- | ---------------- |
  | The repository is on no forge Geordi knows, and there is uncommitted work                                | Commit           |
  | There is work the forge doesn't have, and no pull request                                                | Create PR        |
  | The pull request's checks are failing                                                                    | Fix errors       |
  | Changes were requested in review                                                                         | Address review   |
  | There is a pull request, and local work it doesn't have                                                  | Update PR        |
  | The pull request is an open GitHub draft                                                                 | Ready for review |
  | The pull request is open, its checks pass (or it has none), it is not a draft, and nothing above applies | Merge PR         |
  | The pull request is merged or closed                                                                     | Archive          |

- When the base branch has known commits that the workspace does not contain, the ribbon offers **Sync** beside its next step. Detection uses the base branch as last fetched (or the parent branch for a child workspace). The action is not offered for completed work or a failed turn.
- Sync is done by Geordi itself where git can do it alone: no agent is at work in the workspace, nothing is uncommitted, and the two don't conflict. It fetches, then fast-forwards the branch, or makes a merge commit where the branch has commits of its own; it never rebases. In every other case it asks the agent to fetch, merge the base branch, preserve uncommitted work, resolve conflicts, and run checks; that message can be queued while the agent works.
- Most actions say something to the workspace's agent: the message appears in the conversation like any other, and the agent does the work. If the agent is busy, the message waits its turn (FDR-001).
- An action that has been asked for and is not done yet is shown as under way and can't be asked for twice.
- Ready for review marks the open GitHub pull request ready through the upstream forge. A forge error appears in the workspace.
- **Auto-merge** asks GitHub to merge the workspace pull request when its requirements pass. The action appears when GitHub allows it, the branch is published, and no fixes are pending. GitHub keeps the request through Geordi restarts. The ribbon shows **Auto-merge enabled** and offers **Disable** to people with permission.
- Merge PR is done by Geordi itself, through the upstream forge's API: at once, without an agent turn. It merges only a pull request that is at the very commit the workspace has, the one way the repository allows, or squashed where it allows several. If the forge refuses, the top bar says why.
- Archive checks the workspace and its descendants. It opens a dialog only for active agents, running processes, or unfinished Git work (FDR-001). It is also always available as a quiet button, not only when it is the obvious next step.
- Nothing is offered while Geordi doesn't know the workspace's changes (no daemon connected).
- A workspace whose own commits are all in the branch it started from, with no pull request to say so (an agent's work, merged by the agent that started it), stands as merged, and can be archived.
- Every action has a status beside it. A pushed branch awaiting a pull request shows **Branch pushed** beside **Create PR**. When **Sync** is the only action and no pull request is known, the status is **Behind base branch**.
- An agent's turn that failed comes before everything else: the workspace says so, and offers to have the agent carry on.
- While an agent is at work in the workspace, committing and opening or updating a pull request are not offered: the work is not done. One that was asked for before stays, shown as under way.
- Agents can read the same: the agent API's `workspace_status` tool (FDR-002) says how an agent's own workspace stands, or that of an agent it started, and what the next steps are, with the message each would send. Agents can't trigger actions through it: a step that is a message is work the agent can do itself, or ask of the agent it started; marking ready for review, merging and archiving stay with the person.

## Design Decisions

### 1. Actions are messages to the agent

**Decision:** An action sends a message to the workspace's agent instead of doing the thing itself.
**Why:** The agent knows the work: it writes the commit message and the pull request's description, finds out why a check fails, follows the repository's conventions. It also keeps one thread of history: everything that happened in a workspace is in its conversation.
**Exception:** Marking a draft ready, merging and archiving need no judgement, and a click on "Merge PR" should merge, not start a conversation about it. Geordi does those itself. So it does with Sync on a clean branch that merges without conflicts: that is one git command's worth of work, and an agent turn for it costs minutes. What Geordi leaves out there is what an agent would add: no checks are run afterwards, no hooks run, and the conversation doesn't mention it.
**Tradeoff:** An action costs an agent turn and is only as reliable as the agent. It needs agents that may push and use the forge's tools, which is why they run without permission prompts by default.

### 2. One next step, derived, not configured

**Decision:** Which actions appear is worked out from state by fixed rules, with one of them presented as the next step.
**Why:** The value is in not having to think about what state the workspace is in.
**Tradeoff:** The rules encode one way of working (branch, pull request, checks, review, merge). Teams that work differently can't change them yet.

### 3. What blocks a merge comes before merging

**Decision:** Merge is only offered when nothing else is: failing checks, requested changes and unpublished local work each take its place.
**Why:** Offering to merge next to "fix errors" invites merging something broken.
**Tradeoff:** Someone who wants to merge despite a failing check has to say so to the agent in their own words.

## Related

- **ADRs:** ADR-003, ADR-006
- **FDRs:** FDR-001, FDR-002

## Open Questions

- Merge conflicts are not detected before attempting a merge.
- Letting people define their own actions and prompts.
