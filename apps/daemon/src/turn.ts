import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentEvent } from '@geordi/protocol';
import { API_TOKEN_ENV, type AgentAdapter, type TurnOptions } from './agents/adapter.ts';

export type Turn = { stop(): void; done: Promise<void> };

/**
 * Runs one agent turn: spawns the CLI, maps its JSON output to agent events, and
 * guarantees exactly one terminal event (`turn.completed` or `turn.failed`), sent when the
 * process has exited.
 *
 * A turn is over when the process is, not when the CLI first says so. A resumed Claude
 * session, for one, first deals with anything left over from before (a background task
 * that finished) and reports that as done, and only then turns to the new message. What
 * the CLI says about how things ended is kept, and the last word counts.
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
	/** How the CLI last said the turn ended, if it has. */
	let outcome: AgentEvent | undefined;

	const pass = (event: AgentEvent) => {
		if (event.kind === 'turn.completed' || event.kind === 'turn.failed') outcome = event;
		else if (!ended) emit(event);
	};
	const end = (event: AgentEvent) => {
		if (ended) return;
		ended = true;
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
		for (const event of adapter.parse(parsed)) pass(event);
	});

	const done = new Promise<void>((resolve) => {
		child.on('error', (error) => {
			end({ kind: 'turn.failed', error: `Failed to start ${cmd}: ${error.message}` });
			resolve();
		});
		child.on('close', (code) => {
			const reason = stopped ? 'Stopped' : `${cmd} exited with code ${code}`;
			end(
				stopped || !outcome
					? {
							kind: 'turn.failed',
							error: stderr.trim() && !stopped ? `${reason}: ${stderr.trim()}` : reason
						}
					: outcome
			);
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
