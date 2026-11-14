import type { Agent, SessionEvent } from '@geordi/protocol';

export type TurnOptions = {
	sessionId: string;
	prompt: string;
	/** The session's worktree. */
	cwd: string;
	/**
	 * Paths outside `cwd` an agent needs write access to so it can commit: the parts of the
	 * main repository's `.git` that commits touch. Never `hooks/` or `config`, which would
	 * let a sandboxed agent run code outside its sandbox.
	 */
	writableRoots: string[];
	resumeId: string | null;
};

/**
 * Wraps one agent CLI. Each turn runs the CLI once, non-interactively; follow-up turns
 * resume the CLI's own session via `resumeId`.
 */
export type AgentAdapter = {
	command(options: TurnOptions): { cmd: string; args: string[] };
	/** Maps one line of the CLI's JSON output to session events. */
	parse(line: unknown): SessionEvent[];
};

/** Tool output can be huge (whole files); keep the event log lean. */
export function truncate(text: string, max = 4000): string {
	return text.length > max
		? `${text.slice(0, max)}\n… (${text.length - max} more characters)`
		: text;
}

export async function adapterFor(agent: Agent): Promise<AgentAdapter> {
	switch (agent) {
		case 'claude':
			return (await import('./claude.ts')).claude;
		case 'codex':
			return (await import('./codex.ts')).codex;
	}
}
