import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	GEORDI_DATA_DIR: {
		description: 'Directory where Geordi stores its data. Defaults to ~/.geordi.',
		schema: (value) => value || join(homedir(), '.geordi')
	}
});
