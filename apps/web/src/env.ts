import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	GEORDI_DATA_DIR: {
		description: 'Directory where Geordi stores its data. Defaults to ~/.geordi.',
		schema: (value) => value || join(homedir(), '.geordi')
	},
	GEORDI_ALLOWED_HOSTS: {
		description:
			'Comma-separated hostnames the forge answers to (guards against DNS rebinding). Geordi has no authentication yet, so keep this local. Defaults to localhost,127.0.0.1,[::1].',
		schema: (value) =>
			new Set((value || 'localhost,127.0.0.1,[::1]').split(',').map((host) => host.trim()))
	},
	GEORDI_DAEMON_PORT: {
		description: 'Port (on 127.0.0.1) where daemons connect to the forge. Defaults to 7700.',
		schema: (value) => {
			const port = Number(value || 7700);
			if (!Number.isInteger(port)) throw new Error('GEORDI_DAEMON_PORT must be an integer');
			return port;
		}
	}
});
