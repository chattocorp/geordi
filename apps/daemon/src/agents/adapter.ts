import type { Agent, AgentEvent, AgentSettings, Harness, MessageImage } from '@geordi/protocol';

export type TurnOptions = {
	/** The workspace's ID, for CLIs that let us name their session (so a first turn needs no round trip). */
	sessionId: string;
	prompt: string;
	images?: MessageImage[];
	/** Local image files prepared in the private turn directory for Codex. */
	imagePaths?: string[];
	/** The workspace's worktree. */
	cwd: string;
	/**
	 * Paths outside `cwd` an agent needs write access to so it can commit: the parts of the
	 * main repository's `.git` that commits touch. Never `hooks/` or `config`, which would
	 * let a sandboxed agent run code outside its sandbox.
	 */
	writableRoots: string[];
	resumeId: string | null;
	/** Which model to run, and how hard it should think; the CLI decides what is absent. */
	settings: AgentSettings;
	/** On top of the daemon's own environment: the workspace's ports, for one (FDR-006). */
	env?: Record<string, string>;
	/** What to tell the agent on top of its CLI's own system prompt: where it is, and how to work there. */
	instructions?: string;
	/**
	 * Geordi's agent API (ADR-004), which lets the agent start and supervise other agents:
	 * an MCP server at `url`. The token is in the environment variable `API_TOKEN_ENV`, so
	 * it never shows up in process listings.
	 */
	api: { url: string } | null;
};

export const API_TOKEN_ENV = 'GEORDI_API_TOKEN';
/** The name agents know the API's MCP server by. */
export const API_SERVER = 'geordi';

/**
 * Wraps one agent CLI. Each turn runs the CLI once, non-interactively; follow-up turns
 * resume the CLI's own session via `resumeId`.
 */
export type AgentAdapter = {
	command(options: TurnOptions): { cmd: string; args: string[]; stdin?: string };
	/** The models and effort levels the CLI offers on this machine, as far as we can tell. */
	offers(): Omit<Harness, 'agent'>;
	/** Maps one line of the CLI's JSON output to session events. */
	parse(line: unknown): AgentEvent[];
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
