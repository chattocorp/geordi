# ADR-009: What is live on a page comes over one WebSocket per window

**Date:** 2026-11-16

## Context

Pages show things that change while they are looked at: the sidebar's workspaces and how they stand, a workspace with its conversations, the output of its terminals. Each of these was a request that stays open: a SvelteKit live query, or a stream of server-sent events. A browser has six connections to a server, shared by all its windows and tabs. A workspace with a few terminals or extra conversations used them all, and from then on nothing else got through: no navigation, no message, no button. The page went on updating over the connections it had, so it looked alive while every click did nothing. Bundling what is live into three requests per window helped for one window, and not for two.

## Decision

- The forge has a **WebSocket server for browsers** (`live.ts`), on a port of its own (`GEORDI_LIVE_PORT`, by default the one after `GEORDI_DAEMON_PORT`). A window opens **one** connection to it, and everything live on its pages comes over that. WebSockets are not counted among a browser's six connections.
- The browser says what it follows, each under a number: a **view** by name and key (`navigation`, `workspace <id>`, `repoWorkspaces <id>`), or a **terminal**. The forge sends a view's value whenever it is another, and a terminal's output as it comes, its recent output first.
- **Views** (`views.ts`) are what live queries were: something to read now, and again after every event or when something else says so (`EventStore.live`). They are no longer remote functions.
- Pages **follow** views (`follow()` in `#lib/live.svelte.ts`) and read `current`; they never await them. Terminals follow their output the same way (`followTerminal`).
- The connection is opened again whenever it drops, and everything followed is asked for again. Until then what is on screen stays, marked as not up to date (`connected`).
- **Commands and forms stay remote functions**: short requests, which need nothing held open.
- It answers only to **pages of the forge's own**: a page has to show a token that the forge puts into its own pages (and keeps in its data directory, so that it is the same after a restart). A WebSocket may be opened from any page to anywhere, also from one served on this machine by something an agent runs; no such page can read the forge's pages to learn the token. `Origin` and `Host` must also both be among `GEORDI_ALLOWED_HOSTS`, as for every other request. It listens where the forge does.

## Consequences

- A window holds no request open, however many tabs, terminals and windows there are. The six connections are free for what they are for.
- Pages are no longer rendered on the server with their data: they arrive empty and fill in when the connection is there, a moment later. For an app that is opened once and stays open, that is a fair price.
- One more port. The desktop app's is 7719; `pnpm dev`'s is 7701.
- A second way for data to reach the page, next to remote functions, with its own small protocol to keep working. It is tested against a real WebSocket client (`live.spec.ts`).
- Nothing live may be added as a request that stays open (a live query, an event stream): it becomes a view, or a kind of thing to follow.
