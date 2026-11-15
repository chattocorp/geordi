# ADR-007: Agent turns run detached from the daemon

**Date:** 2026-11-15

## Context

The daemon used to start an agent's CLI as a child process and read its output from a pipe. When the daemon went away (a crash, an update, `node --watch` restarting it after an edit), every agent working at that moment died with it and its turn was lost. Agents work for minutes to hours; the daemon is the part of Geordi we change most often, and Geordi is built with Geordi.

## Decision

- An agent's CLI runs as a **process of its own**, in its own process group, that does not need the daemon: it writes its output to files in a directory for that turn (`~/.geordi/turns/<workspace>`, `GEORDI_TURNS_DIR`). A small shell wrapper notes the exit code there when the CLI ends.
- The daemon **follows those files** rather than a pipe, and notes how far it has passed things on (`offset`). A turn is over when its process is; the directory is removed once the end has been reported.
- A starting daemon **picks up** the turns it finds (`resumeTurns`): it carries on from the offset, and reports turns that ended while no daemon was there. It tells the forge which turns it has (`hello.running`), including those whose end is still waiting to be sent.
- **Ctrl+C stops the agents**; any other way of the daemon going away leaves them working.

## Consequences

- Restarting or crashing the daemon costs no work. Together with ADR-003, neither the forge nor the daemon needs to stay up for an agent to finish.
- The offset is written after the events are sent: a daemon killed in between repeats a line rather than losing one.
- Files are polled (every 100 ms) instead of pushed; simple, and portable.
- An agent whose daemon never comes back keeps working unseen, and can only be stopped by hand.
- A stale turn directory whose process ID has been reused by something else would be followed until that process ends. Unlikely, and harmless beyond a workspace that looks busy.
- Terminals are not covered: their shells still die with the daemon.
