import type { Agent, AgentEvent, AgentSettings, Harness, MessageImage } from '@geordi/protocol';

/** What an agent's CLI is started with, for one session: until it ends, or has been idle a while. */
export type SessionOptions = {
	/** The workspace's ID, for CLIs that let us name their session (so a first turn needs no round trip). */
	sessionId: string;
	/** The session's own, private directory: a place for files the CLI is to read (pictures). */
	dir: string;
	/** The workspace's worktree. */
	cwd: string;
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

/** What a dialogue makes of something: lines to write to the CLI, and what happened. */
export type Step = { write?: string[]; events?: AgentEvent[] };

/**
 * One side of a conversation with a running CLI, in the CLI's own protocol (ADR-010): what
 * to write to it for each thing Geordi can say, and what its output means. It lives in the
 * session's host process, for as long as the CLI does, so it may remember things (which
 * turn is under way, what was asked).
 *
 * Turns are the CLI's to begin and end: `read` says so with `turn.started` and one of
 * `turn.completed` / `turn.failed`. A CLI may begin one unasked (something it ran in the
 * background has finished).
 */
export type Dialogue = {
	/** What to write as soon as the CLI runs, before anything is said. */
	open?(): string[];
	/** Something said to the agent: the start of a turn, or, during one, steering. */
	message(prompt: string, images: MessageImage[]): Step;
	/** Stops the turn under way. The CLI goes on running, and says how the turn ended. */
	interrupt(): Step;
	/** The answers to a `question` the agent asked, one per question, in their order. */
	answer(id: string, answers: string[]): Step;
	/** Makes sense of one line of the CLI's output. */
	read(line: unknown): Step;
	/** Whether the CLI has something running that it will speak up about: it must not be ended meanwhile. */
	busy(): boolean;
};

/** Wraps one agent CLI: how it is started to be talked to, and how that talk goes. */
export type AgentAdapter = {
	command(options: SessionOptions): { cmd: string; args: string[] };
	dialogue(options: SessionOptions): Dialogue;
	/** The models and effort levels the CLI offers on this machine, as far as we can tell. */
	offers(): Omit<Harness, 'agent'>;
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
