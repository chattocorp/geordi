---
data:
  priority: normal
  status: todo
  type: feature
id: k26sa
title: Keep private files out of agents' reach on macOS (FDR-017)
---
Agents trigger macOS privacy prompts ("Geordi would like to access files on a removable volume") by probing places macOS guards. Traced on 2026-11-26/27: `adb devices` and Android SDK probing by agents. See FDR-017.

## Findings so far

- A `sandbox-exec` deny rule makes access fail with EPERM **without** any `tccd` request, so no prompt (tested 2026-11-27).
- Nested sandboxes fail: `sandbox_apply: Operation not permitted`. Codex in "auto" mode (`agent`) sandboxes its own commands, so it would break under ours.
- The installed app is signed ad hoc, so TCC forgets answers on every update (`Failed to match existing code requirement`). Separate fix.

## Live tests (2026-11-27)

Agent CLIs run directly under `sandbox-exec` with a profile denying `~/Downloads` and `/Volumes/T7`; prompt runs `ls ~/Downloads; echo hello > probe.txt`. Codex on gpt-6.2-sol medium, Claude Code on Sonnet medium.

| Agent | Own sandbox | Result |
|---|---|---|
| Codex | `danger-full-access` | Works; `ls ~/Downloads` → Operation not permitted |
| Codex | `workspace-write` (Geordi "auto") | Every command fails: `sandbox_apply: Operation not permitted` |
| Claude Code | off (Geordi's default) | Works; Downloads denied |
| Claude Code | `sandbox.enabled` | Every Bash command fails (exit 71) |

## Plan

- Start the agent CLI in `apps/daemon/src/host.ts` under `/usr/bin/sandbox-exec` with a generated profile on macOS: `(allow default)`, deny `file-read*`/`file-write*` on `/Volumes`, `~/Desktop`, `~/Documents`, `~/Downloads`, `~/Library/Mobile Documents`, and the Photos, Mail, Messages, Contacts and Calendar data; then re-allow the repository checkout, its worktrees and `writableRoots` (later rules win).
- Add a permission mode `full-access-sandboxed` ("Full Permissions (Sandboxed)"), the new default; rename the label of `full-access` to "Full Permissions". Stored `full-access` stays unrestricted. Auto Mode is never sandboxed (decided 2026-11-27).
- Each agent's adapter maps the new mode to its full-access setting; the host adds the sandbox.

## Acceptance criteria

- An agent running `ls /Volumes/<drive>` or `ls ~/Downloads` gets "Operation not permitted" and no macOS prompt appears.
- A repository in `~/Documents` or on an external drive still works for its agents.
- Claude Code, Codex and OpenCode turns work in all three permission modes (live session tests).
- The picker shows the three modes; new workspaces default to the sandboxed one.
- Not on macOS: unchanged.