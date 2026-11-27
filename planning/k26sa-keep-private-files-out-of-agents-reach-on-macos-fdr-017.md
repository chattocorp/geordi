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
- Nested sandboxes fail on macOS: `sandbox_apply: Operation not permitted`. So Auto Mode (Codex `workspace-write`) is never sandboxed by Geordi, and in the sandboxed mode Claude Code's own sandbox is switched off (`_meta.claudeCode.options.sandbox.enabled: false`). Bubblewrap nests on Linux.
- The installed app is signed ad hoc, so TCC forgets answers on every update (`Failed to match existing code requirement`). Separate fix.

## Outcome (2026-11-27)

- Permission mode `sandboxed` ("Full Permissions (Sandboxed)"). `full-access` is labelled "Full Permissions" and stays unrestricted. Protocol version 45.
- Each harness offer lists `permissionModes`: `sandboxed` only where `canSandbox()` (macOS: `sandbox-exec` exists; Linux: a trial `bwrap` run succeeds; Windows: never). The picker defaults to sandboxed where offered, else full access. A saved `sandboxed` choice on a computer without a sandbox stays shown, marked "unavailable", and its turns fail (`NO_SANDBOX`).
- The daemon resolves the mode once per message (`turn-starts.ts`: unset → sandboxed where possible) and passes it explicitly to the host, which never probes; the comparison with a running session uses the resolved mode, so old sessions with unset settings restart.
- `apps/daemon/src/sandbox.ts`: macOS `sandbox-exec` profile (deny `/Volumes` and guarded home folders; paths as `-D` parameters). Linux `bwrap --dev-bind / / --unshare-pid --proc /proc`, `--tmpfs` over existing guarded places (`/media`, `/mnt`, `/run/media`, XDG home folders), `--bind` back allowed paths inside them, then `--remount-ro`. Allowed: cwd, session dir, `writableRoots`, the worktree, the Git common dir and the registered `repoPath` (not the folder the Git dir is in).
- Tests: `sandbox.spec.ts` (resolution, args for both systems, allowed paths, real sandbox where `canSandbox()`, `/proc` escape on Linux), session tests, `acp:probe <agent> sandbox sandboxed` (for Claude with its own sandbox switched on in project settings), stories "Picker without a sandbox" and "Picker with an unavailable mode".
- Reviewed by GPT-6.2-Astra (medium) and an automated security check; their findings are fixed except the one below.
- Live macOS: `acp:probe` passed for Claude Code (Sonnet medium; fails without the fix for its own sandbox) and Codex (gpt-6.2-sol medium). Electron-as-Node and headless Chromium start inside the sandbox.
- Live Linux (Ubuntu 26.04 in OrbStack, bubblewrap 0.11.1): Downloads unreadable, also through `/proc/<pid>/root`; writes there fail; only the repository visible in Documents and writable; network and nested `bwrap` work; the real home is unchanged. No real agent CLI run on Linux.

## Known limits

- On Linux, a guarded folder that doesn't exist at launch isn't covered (covering it would create it on the real filesystem).
- Other tools that sandbox themselves may fail in the sandboxed mode on macOS; pick Full Permissions for such work.
- On Linux, guarded places look empty rather than refusing access.