# Architecture Decision Records

| #                                                                | Decision                                                             | Date       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| [ADR-001](ADR-001-event-sourcing.md)                             | Event sourcing for all Geordi state                                  | 2026-11-14 |
| [ADR-002](ADR-002-forge-and-daemon-monorepo.md)                  | Forge and agent daemon in a TypeScript monorepo                      | 2026-11-14 |
| [ADR-003](ADR-003-live-daemon-channels-outside-the-event-log.md) | Live daemon channels outside the event log                           | 2026-11-14 |
| [ADR-004](ADR-004-agent-api-over-mcp.md)                         | An agent API over MCP, served by the forge                           | 2026-11-14 |
| [ADR-005](ADR-005-design-system.md)                              | A design system of tokens, utilities and components                  | 2026-11-14 |
| [ADR-006](ADR-006-upstream-forges.md)                            | Upstream forges through `forges`, from the daemon                    | 2026-11-14 |
| [ADR-007](ADR-007-detached-agent-turns.md)                       | Agent turns run detached from the daemon                             | 2026-11-15 |
| [ADR-008](ADR-008-desktop-app.md)                                | A desktop app that runs forge and daemon unchanged                   | 2026-11-16 |
| [ADR-009](ADR-009-one-websocket-per-window.md)                   | What is live on a page comes over one WebSocket                      | 2026-11-16 |
| [ADR-010](ADR-010-agent-sessions.md)                             | Agents run as sessions, talked to for as long as they run            | 2026-11-17 |
| [ADR-011](ADR-011-shared-workspace-ui.md)                        | Share workspace components with the website                          | 2026-11-19 |
| [ADR-012](ADR-012-purging-archived-workspaces.md)                | Purging archived workspaces from the event log                       | 2026-11-20 |
| [ADR-013](ADR-013-hosted-forge-with-runner-daemons.md)           | A hosted forge with runner daemons                                   | 2026-11-23 |
| [ADR-014](ADR-014-watching-files-off-the-main-thread.md)         | The daemon watches files in a thread of its own, once per repository | 2026-11-23 |
| [ADR-015](ADR-015-turn-review-blobs.md)                          | Keep turn review context in Git                                      | 2026-11-26 |
