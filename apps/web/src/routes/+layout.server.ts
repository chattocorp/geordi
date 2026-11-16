import { livePort, liveToken } from '#lib/server/app.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Where the page finds what is live on it: the port of the forge's WebSocket, and what to
 * show there to be let in (see `live.ts`). Only pages of the forge's own get to read this.
 */
export const load: LayoutServerLoad = () => ({ live: { port: livePort(), token: liveToken() } });
