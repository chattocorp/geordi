import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, resolve, sep } from 'node:path';
import type { Agent } from '@geordi/protocol';

export const programVariable = {
	claude: 'CLAUDE_CODE_EXECUTABLE',
	codex: 'CODEX_PATH',
	opencode: 'OPENCODE_PATH'
} as const;

/** Resolve the same executable for the daemon's offer and the host's next session. */
export function agentProgram(agent: Agent, env = process.env) {
	const name = env[programVariable[agent]] || agent;
	const paths =
		name.includes('/') || name.includes(sep)
			? [resolve(name)]
			: (env.PATH ?? '')
					.split(delimiter)
					.filter(Boolean)
					.map((dir) => resolve(dir, name));
	const extensions = process.platform === 'win32' ? (env.PATHEXT || '.EXE').split(';') : [];
	for (const path of paths) {
		for (const suffix of ['', ...extensions]) {
			const file = path + suffix;
			try {
				accessSync(file, constants.X_OK);
				if (statSync(file).isFile()) return file;
			} catch {
				// Try the next entry on PATH.
			}
		}
	}
}
