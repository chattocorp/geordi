import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { MODEL_SETTING, type Model } from '@geordi/protocol';
import { agentProgram } from './program.ts';
import type { AgentAdapter } from './adapter.ts';

const run = promisify(execFile);

/** OpenCode prints one provider-qualified model ID per line, in picker order. */
export function modelsIn(output: string): Model[] {
	const ids = output.split(/\r?\n/).map((line) => line.trim());
	return [...new Set(ids)]
		.filter((id) => id.includes('/') && MODEL_SETTING.test(id))
		.map((id) => ({ id, name: id, efforts: [] }));
}

export const opencode: AgentAdapter = {
	async offers() {
		const program = agentProgram('opencode');
		if (program) {
			try {
				const { stdout } = await run(program, ['models'], {
					cwd: homedir(),
					timeout: 5000,
					killSignal: 'SIGKILL',
					windowsHide: true
				});
				return { models: modelsIn(stdout), efforts: [] };
			} catch {
				// The CLI can still use its configured model if discovery fails.
			}
		}
		return { models: [], efforts: [] };
	}
};
