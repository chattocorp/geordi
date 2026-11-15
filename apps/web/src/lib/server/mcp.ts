import { isHttpError } from '@sveltejs/kit';
import { AGENTS, WORKTREE_MODES } from '@geordi/protocol';
import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';
import type { createWorkspaces } from './workspaces.ts';

/**
 * Geordi's agent API (ADR-004, FDR-002) as a Model Context Protocol server: the tools that
 * let an agent start and supervise other agents. Stateless JSON-RPC over HTTP; the caller
 * is the workspace its token belongs to.
 */

/** What the tools work with: the agents API, and archiving (which needs a daemon). */
type Agents = ReturnType<typeof createWorkspaces>['agents'] & {
	/** Archives a workspace on the caller's behalf. Never discards uncommitted work. */
	archive(caller: string, id: string): Promise<void>;
};

const INSTRUCTIONS = `You are running inside Geordi, an agent orchestrator. These tools let you delegate work to other coding agents and supervise them. Start an agent with start_agent (it returns the agent's id), then call wait_for_agent until its status is "idle" and read its reply. An agent with its own worktree works on its own branch, branched from yours: it only sees what you have committed, and you get its work by merging its branch. An agent sharing your worktree sees and edits the same files as you.`;

const agentId = v.pipe(v.string(), v.description('The id of an agent you started'));

/** Each tool: what agents are told about it, its input, and what it does for a caller. */
const tools = {
	start_agent: {
		description:
			'Start another coding agent and give it a task. Returns immediately; use wait_for_agent to get its reply.',
		input: v.object({
			prompt: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(
					'The task, with all the context the agent needs. It knows nothing about your conversation.'
				)
			),
			worktree: v.pipe(
				v.optional(v.picklist(WORKTREE_MODES), 'own'),
				v.description(
					'"own" (default): a new worktree and branch, branched from your branch, for work that should not interfere with yours. "shared": your worktree, for work that needs to see your uncommitted files, such as a review.'
				)
			),
			agent: v.pipe(
				v.optional(v.picklist(AGENTS)),
				v.description('Which agent to start. Defaults to the same kind as you.')
			)
		}),
		run: (
			agents: Agents,
			caller: string,
			input: { prompt: string; worktree: 'own' | 'shared'; agent?: (typeof AGENTS)[number] }
		) => agents.start(caller, input)
	},
	wait_for_agent: {
		description:
			'Wait for an agent you started to finish its current turn, and return its status and reply. If it is still "running" when the timeout ends, call this again.',
		input: v.object({
			agent_id: agentId,
			timeout_seconds: v.pipe(
				v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(600)), 45),
				v.description('How long to wait at most. Defaults to 45.')
			)
		}),
		run: (agents: Agents, caller: string, input: { agent_id: string; timeout_seconds: number }) =>
			agents.wait(caller, input.agent_id, input.timeout_seconds * 1000)
	},
	list_agents: {
		description:
			'List every agent you started (and the agents they started), with status and latest reply.',
		input: v.object({}),
		run: (agents: Agents, caller: string) => agents.list(caller)
	},
	send_message: {
		description:
			'Send a follow-up message to an idle agent you started. It keeps its conversation so far. Returns immediately; use wait_for_agent to get its reply.',
		input: v.object({ agent_id: agentId, message: v.pipe(v.string(), v.minLength(1)) }),
		run: (agents: Agents, caller: string, input: { agent_id: string; message: string }) => {
			agents.send(caller, input.agent_id, input.message);
			return agents.get(caller, input.agent_id);
		}
	},
	archive_agent: {
		description:
			'Archive an agent you started once you are done with it, e.g. after merging its branch. This removes its worktree (unless it shares yours) and takes it off the list; its branch and conversation are kept. Fails if the agent is still working, or if its worktree has uncommitted or untracked files.',
		input: v.object({ agent_id: agentId }),
		run: async (agents: Agents, caller: string, input: { agent_id: string }) => {
			const agent = agents.get(caller, input.agent_id); // only agents the caller started
			await agents.archive(caller, agent.id);
			return { archived: agent.id };
		}
	},
	stop_agent: {
		description: 'Stop an agent you started, if it is running.',
		input: v.object({ agent_id: agentId }),
		run: (agents: Agents, caller: string, input: { agent_id: string }) => {
			agents.stop(caller, input.agent_id);
			return agents.get(caller, input.agent_id);
		}
	}
};

type Request = { jsonrpc: '2.0'; id?: string | number; method: string; params?: unknown };

const result = (id: Request['id'], value: unknown) => ({ jsonrpc: '2.0', id, result: value });
const failure = (id: Request['id'], code: number, message: string) => ({
	jsonrpc: '2.0',
	id,
	error: { code, message }
});

/** A tool's outcome, as text for the model. Failures are results the agent can act on. */
const content = (text: string, isError = false) => ({ content: [{ type: 'text', text }], isError });

async function callTool(agents: Agents, caller: string, params: unknown) {
	const { name, arguments: args = {} } = (params ?? {}) as { name?: string; arguments?: unknown };
	const tool = name && Object.hasOwn(tools, name) ? tools[name as keyof typeof tools] : null;
	if (!tool) return content(`Unknown tool: ${name}`, true);

	const input = v.safeParse(tool.input, args);
	if (!input.success)
		return content(`Invalid input: ${input.issues.map((issue) => issue.message).join('; ')}`, true);

	try {
		const run = tool.run as (agents: Agents, caller: string, input: unknown) => unknown;
		return content(JSON.stringify(await run(agents, caller, input.output), null, 2));
	} catch (error) {
		// Domain errors (limits, unknown agents) are for the agent; anything else is a bug.
		if (isHttpError(error)) return content(error.body.message, true);
		throw error;
	}
}

/**
 * Answers one JSON-RPC message from the agent of the workspace `caller`. Returns `null`
 * for notifications, which get no answer.
 */
export async function handleMcp(agents: Agents, caller: string, message: Request) {
	const { id, method, params } = message;
	if (id === undefined) return null;

	switch (method) {
		case 'initialize': {
			const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
			return result(id, {
				protocolVersion: requested ?? '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'geordi', version: '1' },
				instructions: INSTRUCTIONS
			});
		}
		case 'ping':
			return result(id, {});
		case 'tools/list':
			return result(id, {
				tools: Object.entries(tools).map(([name, tool]) => ({
					name,
					description: tool.description,
					inputSchema: toJsonSchema(tool.input)
				}))
			});
		case 'tools/call':
			return result(id, await callTool(agents, caller, params));
		default:
			return failure(id, -32601, `Method not found: ${method}`);
	}
}
