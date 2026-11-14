import { query } from '$app/server';

const startedAt = Date.now();

/** Live server heartbeat — proves the query.live streaming pipeline end to end. */
export const getStatus = query.live(async function* () {
	while (true) {
		yield { uptime: Math.floor((Date.now() - startedAt) / 1000) };
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
});
