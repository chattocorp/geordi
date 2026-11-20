import type { Worktree } from '../worktree.ts';
import type { Agent, AgentSettings, Harness } from '@geordi/protocol';

/** What an agent's CLI is started with, for one session: until it ends, or has been idle a while. */
export type SessionOptions = {
	/** The workspace's ID, for CLIs that let us name their session (so a first turn needs no round trip). */
	sessionId: string;
	/** The session's own, private directory: a place for files the CLI is to read (pictures). */
	dir: string;
	/** The workspace's worktree. */
	cwd: string;
	worktree?: Worktree;
	/**
	 * Paths outside `cwd` an agent needs write access to so it can commit: the parts of the
	 * main repository's `.git` that commits touch. Never `hooks/` or `config`, which would
	 * let a sandboxed agent run code outside its sandbox.
	 */
	writableRoots: string[];
	/** The CLI's own ID of the conversation so far; `null` if this is its beginning. */
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

export type AgentAdapter = { offers(): Omit<Harness, 'agent'> };

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
		case 'opencode':
			return { offers: () => ({ models: [], efforts: [] }) };
		case 'codex':
			return (await import('./codex.ts')).codex;
	}
}
