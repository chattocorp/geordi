import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentEvent } from '@geordi/protocol';
import { API_TOKEN_ENV, type AgentAdapter, type TurnOptions } from './agents/adapter.ts';

export type Turn = { stop(): void; done: Promise<void> };

/**
 * Runs one agent turn: spawns the CLI, maps its JSON output to session events, and
 * guarantees exactly one terminal event (`turn.completed` or `turn.failed`).
 */
export function runTurn(
	adapter: AgentAdapter,
	options: TurnOptions,
	emit: (event: AgentEvent) => void,
	/** For Geordi's agent API; only passed on if `options.api` is set. */
	apiToken?: string
): Turn {
	const { cmd, args } = adapter.command(options);
	const child = spawn(cmd, args, {
		cwd: options.cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: options.api && apiToken ? { ...process.env, [API_TOKEN_ENV]: apiToken } : process.env
	});

	let ended = false;
	let stopped = false;
	let stderr = '';

	const send = (event: AgentEvent) => {
		if (ended) return;
		if (event.kind === 'turn.completed' || event.kind === 'turn.failed') ended = true;
		emit(event);
	};

	child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-2000)));

	createInterface({ input: child.stdout }).on('line', (line) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return; // not JSON; CLIs occasionally print plain text
		}
		for (const event of adapter.parse(parsed)) send(event);
	});

	const done = new Promise<void>((resolve) => {
		child.on('error', (error) => {
			send({ kind: 'turn.failed', error: `Failed to start ${cmd}: ${error.message}` });
			resolve();
		});
		child.on('close', (code) => {
			const reason = stopped ? 'Stopped' : `${cmd} exited with code ${code}`;
			send({
				kind: 'turn.failed',
				error: stderr.trim() && !stopped ? `${reason}: ${stderr.trim()}` : reason
			});
			resolve();
		});
	});

	return {
		stop() {
			stopped = true;
			child.kill('SIGTERM');
		},
		done
	};
}
