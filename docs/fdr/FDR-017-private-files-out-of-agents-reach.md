# FDR-017: Private files out of agents' reach

**Status:** Planned
**Last reviewed:** 2026-11-27

## Overview

Agents look around a computer freely: they list folders, probe for tools, and run programs that scan devices. On macOS, when one of them touches something macOS protects (an external drive, Documents, Downloads, Photos), you get a prompt asking whether Geordi may access it. macOS holds Geordi responsible for every process it starts, so the prompt names Geordi, not the agent or tool that asked. You can't tell why it appeared, and you get it again and again. Geordi keeps those places out of agents' reach. A look there fails quietly, as an ordinary permission error, and macOS never asks.

## Behavior

- On macOS, an agent and everything it runs can't read or write external drives, mounted volumes, your Desktop, Documents and Downloads, iCloud Drive, or the libraries of Photos, Mail, Messages, Contacts and Calendar.
- An attempt fails with a normal "Operation not permitted". The agent sees the error and carries on. No macOS prompt appears.
- The repository an agent works on is always reachable, wherever it lives, even on an external drive or in Documents. So are its worktrees and the folders Geordi gives the agent to write to.
- Everything else works as before: the agent's own configuration, tool caches, `git`, `gh`, package managers, the network.
- To give an agent a file from a protected place, attach it to your message, or copy it into the worktree.
- Your own terminals and the tasks you agreed to run are yours, and not restricted.
- On other systems, nothing changes for now.

## Design Decisions

### 1. Deny a fixed list, allow the rest

**Decision:** Agents run under a macOS sandbox profile that allows everything except the places macOS guards with privacy prompts.
**Why:** The goal is no prompts, not a locked-down agent. A profile that denies everything and allows a list would break toolchains in ways no one can predict. The places macOS guards are a short, stable list.
**Tradeoff:** An agent can still read everything else in your home folder, such as dotfiles and other projects. This feature doesn't protect against a hostile agent.

### 2. No setting

**Decision:** There's no option to switch it off or to add places.
**Why:** Geordi is opinionated. An agent that needs a protected file can be handed it, which is better than a prompt nobody can trace.
**Tradeoff:** Pointing an agent to a file in Downloads no longer works. You attach it instead.

### 3. The sandbox wraps the agent, not Geordi

**Decision:** Only the agent and everything below it run sandboxed. The forge, the daemon and your terminals don't.
**Why:** The prompts we traced came from agents' commands (`adb`, probing for Android tools). Geordi's own work stays inside its data folder and the repositories.
**Tradeoff:** If Geordi itself ever touches a protected place, a prompt still appears, and that is a bug to fix.

### 4. A stable signature is a separate fix

**Decision:** This feature doesn't depend on how the app is signed.
**Why:** Today the app is signed ad hoc, so macOS forgets an answer at every update and asks again. Signing it properly makes answers last, but doesn't stop the questions. Keeping agents out of these places stops them.
**Tradeoff:** Until the app is signed properly, anything this feature doesn't cover still prompts after every update.

## Related

- **ADRs:** ADR-008, ADR-010
- **FDRs:** FDR-001, FDR-004

## Open Questions

- **Agents with sandboxes of their own.** A process in a macOS sandbox can't start another one. Live tests (2026-11-27) confirmed this: under Geordi's sandbox, Codex with full access and Claude Code without its own sandbox work, and the protected places fail quietly. Codex in its workspace-write sandbox (Geordi's "auto" permission mode), and Claude Code with its sandbox switched on, can't run any command at all. One option is to apply Geordi's sandbox only when the agent has full access, the default. Another is to give "auto" mode's write limits to Geordi's sandbox, and start the agent without a sandbox of its own.
- **Which list exactly.** The places above are the ones macOS guards today. Network volumes and new privacy categories may need adding. Each one is a single path in the profile.
- **sandbox-exec is deprecated.** Apple has deprecated it but still ships it. Chrome, Codex and Claude Code rely on the same mechanism, so it's unlikely to disappear without a replacement.
