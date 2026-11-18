import { PORTS } from '@geordi/launch/services.js';

/**
 * What the `geordi` command runs with, from its environment: the ports (the desktop app's,
 * so that only one Geordi runs at a time) and the URL people open. Throws what is wrong.
 */
export function options(env) {
	const port = (name, fallback) => {
		const value = Number(env[name] || fallback);
		if (!Number.isInteger(value) || value < 1 || value > 65535)
			throw new Error(`${name} must be a port number`);
		return value;
	};
	const web = port('PORT', PORTS.web);
	const daemon = port('GEORDI_DAEMON_PORT', PORTS.daemon);
	const live = port('GEORDI_LIVE_PORT', env.GEORDI_DAEMON_PORT ? daemon + 1 : PORTS.live);
	if (new Set([web, daemon, live]).size < 3)
		throw new Error('PORT, GEORDI_DAEMON_PORT and GEORDI_LIVE_PORT must differ');
	if (env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(env.HOST))
		throw new Error(
			'Geordi has no authentication yet, so it only listens on 127.0.0.1. To reach it from elsewhere, use an SSH tunnel.'
		);
	return { web, daemon, live, origin: env.ORIGIN || `http://localhost:${web}` };
}
