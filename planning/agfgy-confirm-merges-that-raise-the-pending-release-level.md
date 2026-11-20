---
data:
  priority: normal
  status: done
  type: feature
id: agfgy
title: Confirm merges that raise the pending release level
---
When you click **Merge PR**, compare the release planned from changes already merged into the pull request’s target branch with the release that would follow the merge. Ask the repository’s release tool for both plans. Extend the Sweet Release integration described in FDR-007 and add an adapter for Changesets.

## Acceptance criteria

- If the target has a patch pending and the PR raises it to minor with a different planned version, show the affected package and both expected versions. For example, “Merging this PR raises the planned release from 1.4.3 (patch) to 1.5.0 (minor).” Offer **Cancel** and **Merge PR**. Cancel leaves the PR open. Confirm sends the merge request once.
- If a minor release is already pending and the PR adds another minor or patch change, merge with one click. Raising a pending release to major requires confirmation.
- Skip confirmation for a package when both plans produce the same version, including the same next beta.
- Compare each package separately and group all packages that require confirmation in one dialog, including any that the tool calculates for dependent packages.
- Use the current target and the proposed merge result. Exclude unpublished workspace changes. Refresh the comparison if either revision changes before confirmation.
- Verify patch-to-minor and unchanged-level cases with both tools. Preserve repository approval for release-tool commands.

### First pending release

If a package has no release pending, merge its first patch in one click. Ask for confirmation if the PR starts a minor or major release. Use the level reported by the release tool, including for versions below 1.0. For example, “Merging this PR starts a minor release for `api` (1.4.2 → 1.5.0).”

### Unavailable release plan

If the repository uses a supported tool and Geordi cannot compare the plans, show the reason. For a manual merge, offer **Retry**, **Cancel**, and **Merge without release check**. Retry runs the comparison again. Only the explicit override proceeds while the plan is unavailable. Repositories without a supported tool keep their ordinary merge flow.

### Auto-merge

Apply the same per-package rules when someone selects **Enable auto-merge**. If confirmation is required, label the confirming action **Enable auto-merge**. Label the comparison **Release impact when enabled**. Approval covers the plan shown at enablement. The target branch can change before the upstream forge merges the PR.

If the comparison is unavailable, offer **Retry** and leave auto-merge disabled. The person can still choose the manual merge override.

Implemented for Sweet Release and Changesets. Verified the comparison on divergent Git branches, including fixed packages, unpublished files, and changed revisions. Browser stories cover manual and auto-merge choices.