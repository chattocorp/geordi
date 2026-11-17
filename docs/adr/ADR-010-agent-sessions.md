# ADR-010: Agents run as sessions, talked to for as long as they run

**Date:** 2026-11-17

## Context

An agent's CLI was run once per turn (`claude -p <prompt>`, `codex exec <prompt>`), with nothing to say to it once it ran (ADR-007 kept that one process alive across daemon restarts). Three things followed, and none could be had in that shape:

- **Steering** meant stopping the turn and starting another with the message: what the agent was in the middle of was lost.
- **Nothing outlived a turn.** A turn was over when its process was, so an agent could not start something, come to rest, and speak up when it had finished.
- **An agent could not ask anything.** A question needs an answer written back to the process that asked.

Both CLIs have a protocol for exactly this, which their own front ends use: Claude's `stream-json` input and output with control requests, Codex's `app-server` (JSON-RPC). Both need a process that stays, and somebody who remembers where the conversation stands.

## Decision

- An agent's CLI runs as a **session**: one process that is told things for as long as it runs, over its standard input, in its own protocol. A message that arrives between turns starts one; during a turn, it steers. A turn is stopped by asking the CLI to (which then goes on running), and a question the agent asks is an event that is answered the same way.
- Each session has a **host** (`apps/daemon/src/host.ts`): a small process of its own that starts the CLI, holds its pipes and speaks its protocol (the adapter's `Dialogue`, which may remember things, since it lives exactly as long as the CLI). The host needs no daemon. What it is to tell the CLI it reads from a file the daemon appends to (`in.jsonl`, in Geordi's words: message, interrupt, answer, close); what happens it writes, as Geordi's events, to a file the daemon follows (`out.jsonl`). ADR-007 holds unchanged for the pair of them: the files are the queue, in both directions.
- **Turns are the agent's to begin and end.** The daemon reports `turn.started` and one of `turn.completed` / `turn.failed`; an agent may begin a turn unasked (something it ran in the background has finished). The forge takes a workspace to be working from the moment it sends a message, or hears `turn.started`, until it hears the end. Turns are no longer numbered: what a daemon says of a workspace that is not working, as far as the forge knows, is dropped, which is what keeps late and repeated reports out.
- A CLI with **nothing to do for five minutes, and nothing running, is ended**; the next message starts it again where it left off (`resumeId`). What was said to it in the moment it was ending is said to the new one (`Exit.consumed`). A CLI told to run otherwise (another model or effort) is restarted between turns.
- **Stopped means stopped**: what was said during a turn and not read by the time it is stopped is withdrawn, where the CLI lets us, rather than start a turn of its own.
- The agent API's token is the workspace's, for as long as it lives (the CLI is handed it once, when it starts), and valid while its agent is at work.
- We speak the CLIs' protocols ourselves, with no SDK in between: they are lines of JSON, and the adapters are the only place that knows them.

## Consequences

- Steering reaches a working agent in the middle of its turn, an agent can run things in the background and report when they end, and it can ask the person something and wait. Stopping keeps the CLI, and what it had loaded.
- Restarting or crashing the daemon still costs no work; restarting the forge neither. A host that dies takes its CLI with it, and the turn fails: the host is small so that it doesn't.
- An idle CLI stays in memory for a few minutes per workspace, and for as long as it has something running.
- A session's host keeps the adapter it started with: a change to an adapter reaches a workspace when its CLI next starts.
- Claude's control protocol and Codex's app-server are less settled than their one-shot output. Adapter tests are built on captured output, and a line an adapter can't make sense of costs that line only.
- A turn in flight when Geordi is updated across this change is lost: its process is ended, since nothing follows it any more.
- The token no longer changes with every turn. It is still useless while the agent rests.
- Messages said during a turn that is then stopped stay in the conversation, though the agent never read them.
