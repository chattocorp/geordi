# FDR-003: Workspace actions

**Status:** Active
**Last reviewed:** 2026-11-14

## Overview

The top bar of a workspace shows what could or should happen next: publish the work, fix what is failing, merge, archive. One click sets it in motion. People use it to move a workspace along without having to work out its state, or to phrase the same instructions again and again.

## Behavior

- The actions follow from where the workspace's changes and its pull request stand. The most pressing one is shown as the next step; others are offered beside it.

  | When                                                                                                     | Action         |
  | -------------------------------------------------------------------------------------------------------- | -------------- |
  | The repository is on no forge Geordi knows, and there is uncommitted work                                | Commit         |
  | There is work the forge doesn't have, and no pull request                                                | Create PR      |
  | The pull request's checks are failing                                                                    | Fix errors     |
  | Changes were requested in review                                                                         | Address review |
  | There is a pull request, and local work it doesn't have                                                  | Update PR      |
  | The pull request is open, its checks pass (or it has none), it is not a draft, and nothing above applies | Merge PR       |
  | The pull request is merged or closed                                                                     | Archive        |

- Most actions say something to the workspace's agent: the message appears in the conversation like any other, and the agent does the work. If the agent is busy, the message waits its turn (FDR-001).
- An action that has been asked for and is not done yet is shown as under way and can't be asked for twice.
- Archive is done by Geordi itself, not by the agent. It is also always available as a quiet button, not only when it is the obvious next step.
- Nothing is offered while Geordi doesn't know the workspace's changes (no daemon connected).

## Design Decisions

### 1. Actions are messages to the agent

**Decision:** An action sends a message to the workspace's agent instead of doing the thing itself.
**Why:** The agent knows the work: it writes the commit message and the pull request's description, finds out why a check fails, follows the repository's conventions. It also keeps one thread of history: everything that happened in a workspace is in its conversation.
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
- **FDRs:** FDR-001

## Open Questions

- Merge conflicts and branches that are behind their target are not detected yet.
- Letting people define their own actions and prompts.
