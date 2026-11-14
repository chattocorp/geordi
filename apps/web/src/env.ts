import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	GEORDI_DATA_DIR: {
		description: 'Directory where Geordi stores its data. Defaults to ~/.geordi.',
		schema: (value) => value || join(homedir(), '.geordi')
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
