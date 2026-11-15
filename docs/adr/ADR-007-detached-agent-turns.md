# ADR-007: Agent turns run detached from the daemon

**Date:** 2026-11-15

## Context

The daemon used to start an agent's CLI as a child process and read its output from a pipe. When the daemon went away (a crash, an update, `node --watch` restarting it after an edit), every agent working at that moment died with it and its turn was lost. Agents work for minutes to hours; the daemon is the part of Geordi we change most often, and Geordi is built with Geordi.

## Decision

- An agent's CLI runs as a **process of its own**, in its own process group, that does not need the daemon: it writes its output to files in a directory for that turn (`~/.geordi/turns/<workspace>`, `GEORDI_TURNS_DIR`). A small shell wrapper notes the exit code there when the CLI ends.
- The daemon **follows those files** rather than a pipe, and notes how far it has passed things on (`offset`). It only does so while it is connected to the forge: the files are the queue, and nothing counts as passed on that could not be sent. A turn is over when its process is; the directory is removed once the end has been reported.
- A turn's process is known by its ID **and when it started**. After a reboot the ID may belong to something else, which is then neither waited for nor signalled.
- Stopping a turn asks the agent to end (SIGTERM to its process group), and kills it if it hasn't after ten seconds. The turn is over when the agent is gone, not before.
- A starting daemon **picks up** the turns it finds (`resumeTurns`): it carries on from the offset, and reports turns that ended while no daemon was there. It tells the forge which turns it has (`hello.running`), including those whose end is still waiting to be sent.
- **Ctrl+C stops the agents**; any other way of the daemon going away leaves them working.

## Consequences

- Restarting or crashing the daemon costs no work, whether or not the forge is there at that moment. Together with ADR-003, neither the forge nor the daemon needs to stay up for an agent to finish.
- The offset is written after the events are sent: a daemon killed in between repeats a line rather than losing one.
- Files are polled (every 100 ms) instead of pushed; simple, and portable.
- An agent whose daemon never comes back keeps working unseen, and can only be stopped by hand.
- Terminals are not covered: their shells still die with the daemon.
- A line of output an adapter can't make sense of is skipped and logged. It must never take the daemon, and with it everyone's agents, down.
