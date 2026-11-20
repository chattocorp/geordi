import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import type { Agent } from '@geordi/protocol';

export const wrapperName = (agent: Agent) => (agent === 'codex' ? 'codex-acp' : 'claude-agent-acp');

export function wrapperEntry(agent: Agent) {
	const cmd = wrapperName(agent);
	const bundled = join(import.meta.dirname, cmd + '.js');
	return existsSync(bundled)
		? bundled
		: join(
				dirname(createRequire(import.meta.url).resolve(`@agentclientprotocol/${cmd}/package.json`)),
				'dist/index.js'
			);
}

export function wrapperEnv(agent: Agent, env: NodeJS.ProcessEnv) {
	const program = agent;
	const key = agent === 'codex' ? 'CODEX_PATH' : 'CLAUDE_CODE_EXECUTABLE';
	env[key] ||= installed(program, env);
	return env[key]
		? undefined
		: 'Geordi could not find `' + program + '`. Install it, or put it on your PATH.';
}

/** Where a program is on the `PATH`, if it is anywhere. */
function installed(name: string, env: NodeJS.ProcessEnv): string | undefined {
	const extensions = process.platform === 'win32' ? (env.PATHEXT || '.EXE').split(';') : [''];
	for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean))
		for (const extension of extensions)
			if (existsSync(join(dir, name + extension))) return join(dir, name + extension);
}
