import { isAbsolute, join } from 'node:path';

/** Configure an isolated desktop instance before Electron acquires its profile lock. */
export function desktopRuntime(env) {
	const directory = env.GEORDI_DESKTOP_DEV_DIR;
	if (!directory) return { web: 7717, daemon: 7718, live: 7719, env: {} };
	if (!isAbsolute(directory)) throw new Error('GEORDI_DESKTOP_DEV_DIR must be an absolute path');
	const ports = ['PORT', 'GEORDI_DAEMON_PORT', 'GEORDI_LIVE_PORT'].map((name) => {
		const port = Number(env[name]);
		if (!Number.isInteger(port) || port < 1024 || port > 65535)
			throw new Error(`Missing or invalid ${name} for the dev desktop`);
		return port;
	});
	if (new Set(ports).size !== 3) throw new Error('The dev desktop needs three distinct ports');
	const [web, daemon, live] = ports;
	return {
		directory,
		profile: join(directory, 'profile'),
		web,
		daemon,
		live,
		env: {
			GEORDI_DATA_DIR: directory,
			GEORDI_WORKTREES_DIR: join(directory, 'worktrees'),
			GEORDI_SESSIONS_DIR: join(directory, 'sessions'),
			GEORDI_DAEMON_TOKEN_FILE: join(directory, 'daemon-token'),
			GEORDI_DAEMON_TOKEN: '',
			GEORDI_RUN_APPROVALS_FILE: join(directory, 'run-approvals.json'),
			GEORDI_PORTS_FILE: join(directory, 'ports.json')
		}
	};
}
