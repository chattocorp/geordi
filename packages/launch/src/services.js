/**
 * How Geordi's two services are started, wherever they are (ADR-008): the desktop app and
 * the `geordi` command both start them with this, and nothing else. A stage holds the forge
 * in `forge/` and the daemon in `daemon/` (see `stage.js`); this file is copied next to them.
 */

/** The ports Geordi uses unless told otherwise: the web, the daemon's, and the browsers' WebSocket. */
export const PORTS = { web: 7717, daemon: 7718, live: 7719 };

/** What each service is started as, relative to the stage, and with what environment. */
export function services({ web, daemon, live, origin = `http://127.0.0.1:${web}` }) {
	const local = `http://127.0.0.1:${web}`;
	return {
		forge: {
			entry: 'forge/index.js',
			env: {
				HOST: '127.0.0.1', // Geordi has no authentication yet
				BODY_SIZE_LIMIT: String(5 * 1024 * 1024),
				PORT: String(web),
				ORIGIN: origin,
				GEORDI_DAEMON_PORT: String(daemon),
				GEORDI_LIVE_PORT: String(live)
			}
		},
		daemon: {
			entry: 'daemon/main.js',
			env: {
				GEORDI_FORGE_URL: `ws://127.0.0.1:${daemon}`,
				GEORDI_FORGE_HTTP_URL: local
			}
		}
	};
}

/** Resolves once the forge on `web` answers, which is when the daemon may connect. */
export async function forgeReady(web) {
	for (;;) {
		try {
			await fetch(`http://127.0.0.1:${web}`, { method: 'HEAD' });
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}
