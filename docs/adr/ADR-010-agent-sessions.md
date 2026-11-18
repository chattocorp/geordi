# ADR-010: Agents run as sessions, talked to for as long as they run

**Date:** 2026-11-18

## Context

Starting a CLI for each turn made steering interrupt the running process. A background task could finish after its conversation had already closed. Geordi also needs to survive a forge or daemon restart during work (ADR-007).

## Decision

Each active workspace has a detached host that owns the pipes of its ACP wrapper. The desktop ships the same wrapper versions as the development daemon. The wrappers run the `claude` and `codex` the person has installed: Geordi ships neither (some 300 MB each). The host uses the pinned TypeScript SDK and ACP v2. Its state updates distinguish message acceptance, foreground completion, and background activity.

The daemon writes commands to a private session directory. The host writes normalized events there. Each output record has a cursor scoped to the host instance. The forge records the cursor with the event and acknowledges it. The daemon advances its offset after the acknowledgment. After a reconnect the forge also knows which daemon owns each idle session.

The forge records a question answer before it sends it. The host resolves each ACP request once and journals its receipt or withdrawal by question ID. On reconnect, the forge retries outstanding answers for running sessions. A receipt confirms acceptance at the host. The wrapper controls subsequent delivery to the model.

The host sends a working Codex session the steering extension it advertises. Claude accepts more input on its live prompt stream. Geordi keeps explicitly queued messages in its event log. Cancellation is a separate request. An idle host can retire after five minutes if the provider reports no outstanding work. A later message resumes the provider session.

## Consequences

Geordi owns conversation history, workspace identity and the agent API (ADR-004). A provider controls when it consumes live input and which background work it reports. A wrapper upgrade needs live checks for both. The first upgrade from one-process-per-turn ends old running turns.
