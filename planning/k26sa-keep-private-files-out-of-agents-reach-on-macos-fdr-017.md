---
data:
  priority: normal
  status: done
  type: feature
id: k26sa
title: Keep private files out of agents' reach (FDR-017)
---
Agents trigger macOS privacy prompts ("Geordi would like to access files on a removable volume") by probing places macOS guards. Traced on 2026-11-26/27: `adb devices` and Android SDK probing by agents. See FDR-017.

## Findings

- A `sandbox-exec` deny rule makes access fail with EPERM **without** any `tccd` request, so no prompt.
- Nested sandboxes fail on macOS: `sandbox_apply: Operation not permitted`. So Auto Mode (Codex `workspace-write`, Claude Code's own sandbox) is never sandboxed by Geordi. Bubblewrap nests on Linux.
- The installed app is signed ad hoc, so TCC forgets answers on every update (`Failed to match existing code requirement`). Separate fix.

## Outcome (2026-11-27)

- Permission mode `sandboxed` ("Full Permissions (Sandboxed)"). `full-access` is labelled "Full Permissions" and stays unrestricted. Protocol version 45.
- Each harness offer lists `permissionModes`: `sandboxed` only where `canSandbox()` (macOS: `sandbox-exec` exists; Linux: a trial `bwrap` run succeeds; Windows: never). The picker shows only those, and defaults to sandboxed where offered, else full access. A workspace that never chose follows the same default on the daemon. An explicit `sandboxed` on a computer without a sandbox fails the turn (`NO_SANDBOX`), never runs unsandboxed.
- `apps/daemon/src/sandbox.ts`: macOS `sandbox-exec` profile (deny `/Volumes` and guarded home folders, re-allow where the agent works; paths as `-D` parameters). Linux `bwrap --dev-bind / /`, `--tmpfs` over existing guarded places (`/media`, `/mnt`, `/run/media`, XDG home folders), `--bind` back allowed paths inside them, then `--remount-ro` the covers.
- Tests: `sandbox.spec.ts` (args for both systems; runs the real sandbox where `canSandbox()`), session tests for the new mode, `acp:probe <agent> sandbox sandboxed`, story "Picker without a sandbox".
- Live macOS: `acp:probe` passed for Claude Code (Sonnet medium) and Codex (gpt-6.2-sol medium). Electron-as-Node and headless Chromium start inside the sandbox.
- Live Linux (Ubuntu 26.04 in OrbStack, bubblewrap 0.11.1): Downloads unreadable, writes there fail (read-only), only the repository visible in Documents and writable, `/mnt` and `/media` empty, network works, nested `bwrap` works. No real agent CLI run on Linux.

## Known limits

- Claude Code with its own `sandbox.enabled` in the person's settings can't run Bash in the sandboxed mode on macOS.
- Other tools that sandbox themselves may fail in the sandboxed mode on macOS; pick Full Permissions for such work.
- On Linux, guarded places look empty rather than refusing access.