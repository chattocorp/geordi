import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineEnvVars } from '@sveltejs/kit/env';

function count(value: string | undefined, fallback: number, name: string): number {
	const number = Number(value || fallback);
	if (!Number.isInteger(number) || number < 0)
		throw new Error(`${name} must be a non-negative integer`);
	return number;
}

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
	GEORDI_AGENT_MAX_DEPTH: {
		description:
			'How many agents deep a chain of agents starting agents may get. 0 keeps agents from starting agents. Defaults to 3.',
		schema: (value) => count(value, 3, 'GEORDI_AGENT_MAX_DEPTH')
	},
	GEORDI_AGENT_MAX_CHILDREN: {
		description: 'How many agents one agent may have running at once. Defaults to 5.',
		schema: (value) => count(value, 5, 'GEORDI_AGENT_MAX_CHILDREN')
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
