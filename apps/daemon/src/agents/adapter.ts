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
	/** The repository's own checkout, which a sandboxed agent may reach wherever it is (FDR-017). */
	repoPath?: string;
	/** The CLI's own ID of the conversation so far; `null` if this is its beginning. */
	resumeId: string | null;
	/** Which model to run, and how hard it should think; the CLI decides what is absent. */
	settings: AgentSettings;
	/** On top of the daemon's own environment: the workspace's ports, for one (FDR-006). */
	env?: Record<string, string>;
	/** Whether Claude Code is told that Geordi started it (`CLAUDE_CODE_ENTRYPOINT`; see `host.ts`). */
	identify?: boolean;
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

/**
 * Whether an old installation restricted agents at the daemon level, which a workspace that
 * never chose a permission mode must not quietly replace.
 */
export function restrictedByDaemon(agent: Agent): boolean {
	if (agent === 'codex') return process.env.GEORDI_CODEX_SANDBOX === 'workspace-write';
	const claudeMode = process.env.GEORDI_CLAUDE_PERMISSION_MODE;
	return agent === 'claude' && !!claudeMode && claudeMode !== 'bypassPermissions';
}
/** The name agents know the API's MCP server by. */
export const API_SERVER = 'geordi';

type Offer = Omit<Harness, 'agent' | 'permissionModes'>;
export type AgentAdapter = { offers(): Offer | Promise<Offer> };

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
			return (await import('./opencode-models.ts')).opencode;
		case 'codex':
			return (await import('./codex.ts')).codex;
	}
}
