---
data:
  priority: normal
  status: done
  type: feature
id: k26sa
title: Keep private files out of agents' reach on macOS (FDR-017)
---
Agents trigger macOS privacy prompts ("Geordi would like to access files on a removable volume") by probing places macOS guards. Traced on 2026-11-26/27: `adb devices` and Android SDK probing by agents. See FDR-017.

## Findings

- A `sandbox-exec` deny rule makes access fail with EPERM **without** any `tccd` request, so no prompt.
- Nested sandboxes fail: `sandbox_apply: Operation not permitted`. So Auto Mode (Codex `workspace-write`, Claude Code's own sandbox) is never sandboxed by Geordi.
- The installed app is signed ad hoc, so TCC forgets answers on every update (`Failed to match existing code requirement`). Separate fix.

## Outcome (2026-11-27)

- Permission mode `sandboxed` ("Full Permissions (Sandboxed)"), the default, also for workspaces that never chose. `full-access` is labelled "Full Permissions" and stays unrestricted. Protocol version 45.
- `apps/daemon/src/sandbox.ts`: the host starts the agent CLI under `/usr/bin/sandbox-exec` on macOS. `(allow default)`, deny `/Volumes` and the guarded home folders, re-allow cwd, the session dir, `writableRoots`, the worktree and the main checkout. Paths are passed as `-D` parameters.
- Tests: `sandbox.spec.ts` (runs the real sandbox on macOS), session tests for the new mode, and an `acp:probe <agent> sandbox sandboxed` scenario.
- Live: `acp:probe` passed for Claude Code (Sonnet medium) and Codex (gpt-6.2-sol medium): Downloads → "Operation not permitted", writes in the workspace work. Electron-as-Node and headless Chromium (Playwright) start inside the sandbox.
- Not tested live: OpenCode (same code path as full access plus the sandbox), Auto and Full Permissions modes against real CLIs (unchanged paths; running them would really read Downloads and might prompt).

## Known limits

- Claude Code with its own `sandbox.enabled` in the person's settings can't run Bash in the sandboxed mode.
- Other tools that sandbox themselves (iOS Simulator, some Electron apps) may fail in the sandboxed mode; pick Full Permissions for such work.