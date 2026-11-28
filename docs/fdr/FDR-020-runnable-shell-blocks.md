# FDR-020: Run shell blocks from agent replies

**Status:** Active

**Last reviewed:** 2026-11-28

## Overview

A person can run a command an agent offers in conversation and keep working in the terminal where it ran.

## Behavior

- A completed code block tagged `sh` has a Run button beside Copy in an agent reply when the workspace can open terminals.
- Each click selects a fresh terminal in the dock and runs the displayed text in an interactive POSIX shell in the workspace directory with its assigned ports.
- The shell accepts input after the command finishes. Its output and processes survive a forge restart.

## Design decisions

1. **An explicit invitation to run.** Agents use one complete `sh` block per runnable example. Requiring the exact tag and a closing fence lets them show shell transcripts and stream partial commands safely.
2. **A new terminal each time.** Each run keeps its own output and leaves existing shells available. Repeating a run adds another tab.

## Related

- ADR-003, live daemon channels
- FDR-001, workspaces
- FDR-006, workspace tasks and ports
