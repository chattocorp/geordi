---
data:
  priority: high
  status: done
  tags:
    - repos
    - workspaces
  type: bug
id: wjz52
title: Allow repository removal after its checkout disappears
---
Deleting a registered checkout outside Geordi can strand its workspaces. Settings → Repositories requires archiving each workspace before Remove is available (FDR-005). Archive inspects the worktree and asks Git to prune it through the registered checkout.

## Plan

1. Reproduce in the dev app with a disposable checkout and an open workspace. Trace archive preview, process shutdown and cleanup after removing the checkout externally. Repeat with the workspace directory also gone.
2. Have the daemon distinguish a missing checkout from an offline daemon, permission errors and other Git failures. In the archive flow, name the missing checkout. If a workspace folder survives, show its path and offer to archive while keeping its files. Those files may be the only copy of local edits.
3. On confirmation, apply the existing archive rules for locks, workspace families and running processes. Close sessions, terminals and jobs and release workspace resources. Skip teardown scripts and Git cleanup for the missing checkout. Preserve the existing archive path for healthy repositories.
4. In Settings, show which workspaces still need archiving and link to them. After the last archive, enable the existing Remove action even when the registered path is missing. Keep conversations readable in Archive and explain that resuming Git work requires a usable checkout.

## Acceptance criteria

- Complete archive and removal from the UI without recreating the checkout. A registration with zero open workspaces can be removed directly.
- Verify surviving untracked edits byte-for-byte. Cover missing and surviving workspace folders, a shared worktree, a lock and an active agent or job. Cancellation preserves the workspace.
- Recheck the checkout at confirmation and handle retries after partial cleanup. An offline daemon or unreadable directory must not be reported as a deleted checkout.
- Restart the forge. The registration stays removed, conversations remain readable and other repositories are unaffected. Adding the same path again retains its repository identity.
- Add regression tests, verify both paths in the dev app and update FDR-001 and FDR-005 when the fix ships.

## Outcome

Implemented the missing-checkout archive flow. Settings links to the open workspaces. Archived conversations can be read after repository removal.

Verified with an isolated forge, daemon and disposable checkouts. Archived and removed repositories with and without a surviving workspace folder, checked untracked bytes, cancelled an archive and restored a checkout during confirmation. Restarted the forge, opened the archived conversation, re-added each checkout and restored its workspace. Regression tests cover locks, shared worktrees, a running job, offline and permission errors, and retries.