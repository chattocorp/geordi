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

## Plan

- Start the agent CLI in `apps/daemon/src/host.ts` under `/usr/bin/sandbox-exec` with a generated profile on macOS: `(allow default)`, deny `file-read*`/`file-write*` on `/Volumes`, `~/Desktop`, `~/Documents`, `~/Downloads`, `~/Library/Mobile Documents`, and the Photos, Mail, Messages, Contacts and Calendar data; then re-allow the repository checkout, its worktrees and `writableRoots` (later rules win).
- Settle the open question on agents with their own sandbox (Codex auto mode, Claude Code sandbox) with live tests first.

## Acceptance criteria

- An agent running `ls /Volumes/<drive>` or `ls ~/Downloads` gets "Operation not permitted" and no macOS prompt appears.
- A repository in `~/Documents` or on an external drive still works for its agents.
- Claude Code, Codex and OpenCode turns work in both permission modes (live session tests).
- Not on macOS: unchanged.