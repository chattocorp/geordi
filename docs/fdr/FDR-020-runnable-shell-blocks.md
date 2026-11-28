# FDR-020: Run shell blocks from agent replies

**Status:** Active

**Last reviewed:** 2026-11-28

## Overview

A person can run a command an agent offers in conversation and keep working in the terminal where it ran.

## Behavior

- A completed code block tagged `sh` has a Run button beside Copy in an agent reply when the workspace can open terminals.
- Each click selects a fresh terminal in the dock and runs the displayed text in an interactive POSIX shell in the workspace directory with its assigned ports.
- The terminal shows the whole block in dim text before its output, so the command can be read later.
- When the command finishes or the person presses Ctrl-C to interrupt it, their usual shell opens in the same terminal with the directory and exported variables the block left behind. An explicit `exit` closes the shell. The terminal and its scrollback survive a forge restart.

## Design decisions

1. **An explicit invitation to run.** Agents use one complete `sh` block per runnable example. Requiring the exact tag and a closing fence lets them show shell transcripts and stream partial commands safely.
2. **A new terminal each time.** Each run keeps its own output and leaves existing shells available. Repeating a run adds another tab.
3. **Use the shell named by the block, then the person’s own shell.** POSIX commands work even when the person normally uses Fish. Handing over after the block restores their familiar prompt, history and completions.

## Related

- ADR-003, live daemon channels
- FDR-001, workspaces
- FDR-006, workspace tasks and ports
