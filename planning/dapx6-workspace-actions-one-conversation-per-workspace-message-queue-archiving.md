---
data:
  priority: high
  status: done
  tags:
    - agents
    - ui
  type: feature
id: dapx6
title: Workspace actions, one conversation per workspace, message queue, archiving
---
FDR-003 and the reworked FDR-001. A workspace is one conversation; messages queue while the agent works; the top bar offers the next step (create/update PR, fix errors, address review, merge, archive) as messages to the agent; workspaces can be archived (covers 7ncxh). Agents run without permission prompts by default.

Outcome: implemented and run end to end with Claude and Codex on a scratch repository (action to commit, queued message, archive). The pull-request actions are covered by tests of the rules only: no real pull request was created or merged.

Follow-up complete: the ribbon offers Update when the base branch has known commits absent from the workspace. The action asks the agent to merge them and also supports parent branches. Verified with real Git fetch/merge tests, action-rule tests, browser stories, pnpm check, pnpm lint, pnpm test, and sweet doctor.

Label and layout refinement: use Update to make the merge direction clear, and keep the main ribbon action at the far right.

The sidebar archive icon uses the merged workspace color on hover and keyboard focus. Verified the hover color in Chromium.

The Archive action in the workspace context menu uses the same purple as the sidebar archive icon.

The Resolve conflicts button now uses the conflict indicator’s colour. Its Storybook example checks that the button and indicator match.

The Checks running icon now turns once every two seconds. Verified the animation duration in Chromium.

The incoming-commits action is now labeled Sync.

The Sync button shows the incoming base commit count in regular-weight muted text at 70% opacity.

Sync checks whether Git can preserve local edits before moving the branch. The sidebar gives a working agent’s Braille spinner priority over the action icon. Covered by Git integration tests and the Workspace activity browser story.
