import { isHttpError } from '@sveltejs/kit';
import {
	AGENTS,
	CONFIG_FILE,
	CONFIG_SETTINGS,
	SETTING,
	WORKTREE_MODES,
	type Changes,
	type Harness,
	type RepoConfig,
	type Upstream
} from '@geordi/protocol';
import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';
import { actionsFor, standingOf } from '@geordi/ui/actions';
import { isExternal } from './agent-access.ts';
import type { createWorkspaces } from './workspaces.ts';

/**
 * Geordi's agent API (ADR-004, FDR-002) as a Model Context Protocol server: the tools that
 * let agents work with Geordi workspaces. Stateless JSON-RPC over HTTP.
 */

/** What the tools work with: the agents API, and archiving (which needs a daemon). */
type Agents = ReturnType<typeof createWorkspaces>['agents'] & {
	/** Archives a workspace on the caller's behalf. Never discards uncommitted work. */
	archive(caller: string, id: string): Promise<void>;
	/** What the repository's configuration says for the caller's workspace, as a daemon reads it. */
	configuration(caller: string): Promise<RepoConfig>;
	/** How a worktree's work stands, as a daemon says. Rejects if none can. */
	standing(worktreeId: string): Promise<{ changes: Changes; upstream: Upstream | null }>;
	/** The models and effort levels on offer, per agent; `null` while no daemon is connected. */
	harnesses(): Harness[] | null;
};

/** What `start_agent` can be asked to run, as the daemon offers it. */
export const offersOf = (harnesses: Harness[] | null) =>
	harnesses
		? [
				'On offer (pass a model by its id, and one of its effort levels):',
				...harnesses.map(({ agent, models, efforts }) =>
					[
						`- ${agent}:`,
						...(models.length > 0
							? models.map(
									(model) =>
										`  - ${model.id} (${model.name}): ${model.efforts.join(', ') || 'no choice of effort'}`
								)
							: [`  - no models to choose from; effort: ${efforts.join(', ') || 'no choice'}`])
					].join('\n')
				)
			].join('\n')
		: 'What models and effort levels are on offer is not known right now: no daemon is connected.';

/**
 * How to configure a repository for Geordi (FDR-006), for an agent about to do so. Made
 * from the settings' one definition, so that it can't say anything else than what the
 * daemon accepts.
 */
export const configurationReference = () =>
	[
		`# ${CONFIG_FILE}`,
		`A repository tells Geordi how it wants to be treated in a file called \`${CONFIG_FILE}\`, at its top level. It is YAML. Settings Geordi doesn't know are ignored. (A \`.geordi.toml\` with the same settings in TOML is still read where there is no \`${CONFIG_FILE}\`; write YAML.)`,
		'## Settings',
		...Object.entries(CONFIG_SETTINGS).map(
			([key, { does, example }]) => `### \`${key}\`\n\n${does}\n\n\`\`\`yaml\n${example}\n\`\`\``
		),
		'## Which file applies',
		`The \`${CONFIG_FILE}\` in a workspace's own directory, if it has one; otherwise the one on the branch work starts from (the upstream's main branch). The two are not merged. So you can try a change out in your workspace right away, and it applies to everyone once it is merged. The file is read again whenever it changes: nothing needs restarting.`,
		'## Checking',
		`After changing the file, call \`check_configuration\`: it reads the file the way Geordi does, and says what it found or what is wrong with it.`
	].join('\n\n');

const INSTRUCTIONS = `You are running inside Geordi, an agent orchestrator. These tools let you delegate work to other coding agents and supervise them. Start an agent with start_agent (it returns the agent's id), then call wait_for_agent until its status is "idle" and read its reply. An agent with its own worktree works on its own branch, branched from yours: it only sees what you have committed, and you get its work by merging its branch. An agent sharing your worktree sees and edits the same files as you. If one of these tools cannot reach Geordi (a connection error), Geordi is restarting, which takes seconds: the agents you started keep working. Wait a little and call again; do not give up on them. You can also look at any workspace in this Geordi installation, in any repository, with list_workspaces, read_workspace and workspace_status.`;

/** The longest one `wait_for_agent` call waits: safely under what agent CLIs allow a tool call. */
const MAX_WAIT_SECONDS = 45;

const agentId = v.pipe(v.string(), v.description('The id of an agent you started'));

/** Each tool: what agents are told about it, its input, and what it does for a caller. */
const tools = {
	start_agent: {
		description: (harnesses: Harness[] | null) =>
			[
				'Start another coding agent and give it a task. Returns immediately; use wait_for_agent to get its reply.',
				'An agent of your kind runs with your model and effort unless you ask for others; another kind runs with its defaults.',
				offersOf(harnesses)
			].join('\n\n'),
		input: v.object({
			prompt: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(
					'The task, with all the context the agent needs. It knows nothing about your conversation.'
				)
			),
			repository: v.pipe(
				v.optional(v.string()),
				v.description(
					'Projects and clients outside Geordi only: the ID of the repository to start in (see list_repositories). An agent in a repository workspace starts agents in its own.'
				)
			),
			worktree: v.pipe(
				v.optional(v.picklist(WORKTREE_MODES), 'own'),
				v.description(
					'"own" (default): a new worktree and branch, branched from your branch, for work that should not interfere with yours. "shared": your worktree, for work that needs to see your uncommitted files, such as a review. In a project: "shared" starts the agent in the project itself, working in its folder alongside you.'
				)
			),
			workspace: v.pipe(
				v.optional(v.string()),
				v.description(
					'Projects only: the ID of an existing workspace in a repository to start the agent in, alongside its agent, in its worktree and on its branch.'
				)
			),
			agent: v.pipe(
				v.optional(v.picklist(AGENTS)),
				v.description('Which agent to start. Defaults to the same kind as you.')
			),
			model: v.pipe(
				v.optional(v.pipe(v.string(), v.regex(SETTING, 'That is not a model'))),
				v.description(
					'The model it runs, by its id (see what is on offer). Defaults to yours, for an agent of your kind.'
				)
			),
			effort: v.pipe(
				v.optional(v.pipe(v.string(), v.regex(SETTING, 'That is not an effort level'))),
				v.description(
					"How hard it thinks: one of its model's effort levels. Defaults to yours, for an agent of your kind."
				)
			),
			title: v.pipe(
				v.optional(v.pipe(v.string(), v.maxLength(80))),
				v.description(
					"A short name for the agent's work (a few words), by which the person finds it in their list. Give one: you know what you are handing over."
				)
			)
		}),
		run: (
			agents: Agents,
			caller: string,
			input: {
				prompt: string;
				repository?: string;
				worktree: 'own' | 'shared';
				workspace?: string;
				agent?: (typeof AGENTS)[number];
				model?: string;
				effort?: string;
				title?: string;
			}
		) => agents.start(caller, input, agents.harnesses())
	},
	name_workspace: {
		description:
			'Give your own workspace a short name that says what the work is about (a few words, no quotes, no full stop), by which the person finds it among their others. Call this once you know what the work is. Call it again only if the work turns out to be about something else.',
		input: v.object({ title: v.pipe(v.string(), v.minLength(1), v.maxLength(80)) }),
		run: (agents: Agents, caller: string, input: { title: string }) =>
			agents.name(caller, input.title)
	},
	wait_for_agent: {
		description:
			'Wait for an agent (any workspace in this Geordi installation) to finish its current turn, and return its status and reply. One call waits 45 seconds at most: if the agent is still "running" then, call this again, for as long as it takes.',
		input: v.object({
			agent_id: v.pipe(v.string(), v.description('A workspace ID')),
			timeout_seconds: v.pipe(
				v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(600)), 45),
				v.description('How long to wait at most. Defaults to 45, which is also the most.')
			)
		}),
		run: (agents: Agents, caller: string, input: { agent_id: string; timeout_seconds: number }) =>
			// Never longer than agent CLIs give a tool call (a minute): a wait that outlasts that
			// comes back as a failure, and tells the caller nothing.
			agents.wait(caller, input.agent_id, Math.min(input.timeout_seconds, MAX_WAIT_SECONDS) * 1000)
	},
	list_agents: {
		description:
			'List every agent you started (and the agents they started), with status and latest reply.',
		input: v.object({}),
		run: (agents: Agents, caller: string) => agents.list(caller)
	},
	list_repositories: {
		description: 'List the repositories in this Geordi installation, with their IDs.',
		input: v.object({}),
		run: (agents: Agents, caller: string) => agents.listRepositories(caller)
	},
	list_workspaces: {
		description:
			'List workspaces in this Geordi installation with their IDs, links, branches and status. Set include_archived to include history.',
		input: v.object({ include_archived: v.optional(v.boolean(), false) }),
		run: (agents: Agents, caller: string, input: { include_archived: boolean }) =>
			agents.listWorkspaces(caller, input.include_archived)
	},
	read_workspace: {
		description:
			'Read the latest 50 conversation messages and pending questions. A user message with from came from that agent. Pass the returned before cursor to read earlier messages.',
		input: v.object({
			workspace_id: v.string(),
			before: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)))
		}),
		run: (agents: Agents, caller: string, input: { workspace_id: string; before?: number }) =>
			agents.readWorkspace(caller, input.workspace_id, input.before)
	},
	send_message: {
		description:
			'Send a message to an agent you started (a project or a client outside Geordi: to any workspace). It keeps its conversation so far. An idle agent starts on it at once. An agent that is working gets it when its current turn ends, unless you set `interrupt` (only for agents you started). Returns immediately; use wait_for_agent to get its reply.',
		input: v.object({
			agent_id: v.pipe(
				v.string(),
				v.description('A workspace ID, from start_agent or list_workspaces')
			),
			message: v.pipe(v.string(), v.minLength(1)),
			interrupt: v.pipe(
				v.optional(v.boolean(), false),
				v.description(
					'For an agent that is working: give it this message now, in the middle of what it is doing. It reads it at its next step and goes on from there, with nothing stopped. Use it to turn an agent around that is going the wrong way, or to tell it something it needs now. Without it, the message waits for the turn to end. (To make it stop altogether, use stop_agent.)'
				)
			)
		}),
		run: (
			agents: Agents,
			caller: string,
			input: { agent_id: string; message: string; interrupt: boolean }
		) => {
			agents.send(caller, input.agent_id, input.message, input.interrupt);
			return agents.reportWorkspace(caller, input.agent_id);
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
	configuration_reference: {
		description: `How to configure this repository for Geordi, in its ${CONFIG_FILE}: the settings there are and what they do. Read this before creating or changing that file.`,
		input: v.object({}),
		run: () => configurationReference()
	},
	check_configuration: {
		description: `Read this workspace's ${CONFIG_FILE} the way Geordi does, and say which file applies, what it sets, and any configuration problem. Call this after changing the file.`,
		input: v.object({}),
		run: async (agents: Agents, caller: string) => {
			const { source, file, problem, ports, jobs, urls, setup, teardown } =
				await agents.configuration(caller);
			// the file by the name it has; one in the old language is still read, and said to be
			const name = `${file ?? CONFIG_FILE}${file && file !== CONFIG_FILE ? ` (still read, but ${CONFIG_FILE} is what to write: move its settings there)` : ''}`;
			const commands = [...jobs, ...(setup ? [setup] : []), ...(teardown ? [teardown] : [])];
			return {
				applies:
					source === 'workspace'
						? `the ${name} in your working directory`
						: source === 'base'
							? `the ${name} on the branch work starts from (your working directory has none)`
							: `none: there is no ${CONFIG_FILE}`,
				problem,
				ports,
				jobs: jobs.map(({ name, label, command, needs, port }) => ({
					name,
					label,
					command,
					needs,
					port
				})),
				urls,
				setup: setup?.command ?? null,
				teardown: teardown?.command ?? null,
				...(commands.some((command) => !command.approved) && {
					note: 'Nobody has agreed to run some of these commands yet. The person is shown them and asked before they first run; you cannot agree on their behalf.'
				})
			};
		}
	},
	workspace_status: {
		description:
			"How a workspace's work stands, as the person sees it: its changes, its pull request and checks, and the next steps Geordi offers them. Any workspace in this Geordi installation (`agent_id`). A step with a `prompt` is what Geordi would tell the workspace's agent to do; one without is something the person does (merging, archiving). What the forge says may be up to a minute old.",
		input: v.object({
			agent_id: v.pipe(
				v.optional(v.string()),
				v.description(
					'A workspace ID. Workspace agents default to their own ID. External callers must supply one.'
				)
			)
		}),
		run: async (agents: Agents, caller: string, input: { agent_id?: string }) => {
			const workspace = agents.workspace(caller, input.agent_id);
			const { changes, upstream } = await agents.standing(workspace.worktreeId);
			const state = {
				changes,
				upstream,
				continued: workspace.continued,
				failed: workspace.lastTurn === 'failed',
				child: !!workspace.parentId
			};
			const pull = upstream?.pull;
			return {
				id: workspace.id,
				title: workspace.title,
				status: workspace.status,
				branch: changes.branch,
				standing: standingOf(state)?.label ?? null,
				changes: {
					files: changes.files.length,
					uncommitted: changes.uncommitted,
					unpushed: changes.unpushed,
					landed: changes.landed,
					incoming: changes.incoming ?? null
				},
				upstream: upstream && {
					repo: upstream.repo,
					pushed: upstream.pushed,
					pull: pull && {
						number: pull.number,
						title: pull.title,
						url: pull.url,
						state: pull.state,
						draft: pull.draft,
						base: pull.base,
						checks: pull.checks && {
							state: pull.checks.state,
							...(pull.checks.counts ?? { total: pull.checks.total, failed: pull.checks.failed })
						},
						review: pull.review,
						conflicts: pull.conflicts ?? null
					}
				},
				next: actionsFor(state).map(({ id, label, prompt }) => ({
					id,
					label,
					...(prompt && { prompt })
				}))
			};
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

/** What only an agent in a workspace can use: it is about that workspace. */
const workspaceTools = new Set([
	'name_workspace',
	'configuration_reference',
	'check_configuration'
]);
/** What is about a workspace's repository, which a project has none of (FDR-012). */
const repositoryTools = new Set(['configuration_reference', 'check_configuration']);
const available = (agents: Agents, caller: string, name: string) =>
	isExternal(caller)
		? !workspaceTools.has(name)
		: !agents.isProject(caller) || !repositoryTools.has(name);

const EXTERNAL_INSTRUCTIONS = `You are connected to Geordi, an agent orchestrator: each workspace is one conversation with a coding agent, in a worktree on its own branch. list_workspaces and read_workspace show you any of them in the repositories you were given access to; send_message follows up with an agent, and wait_for_agent waits for its reply. To start work, find a repository with list_repositories and give start_agent a task in it: you may then supervise that agent (interrupt, stop, archive), as you may not others. Questions an agent asks are for the person to answer.`;

const PROJECT_INSTRUCTIONS = `You are running inside Geordi, an agent orchestrator, in a project: a workspace that belongs to no repository, from which you orchestrate coding agents for the person. Find a repository with list_repositories and give start_agent a task in it (it returns the agent's id), then call wait_for_agent until its status is "idle" and read its reply. Each agent you start works in a worktree and branch of its own, from the repository's main branch. You act for the person: list_workspaces, read_workspace and workspace_status show you any workspace, and you may message, interrupt, stop and archive any agent in a repository, whoever started it, and the agents in your own project. Start an agent alongside an existing workspace's agent with start_agent's workspace parameter, or alongside you with worktree "shared". Other projects are not yours to see or touch. If one of these tools cannot reach Geordi (a connection error), Geordi is restarting, which takes seconds: the agents you started keep working. Wait a little and call again; do not give up on them.`;

async function callTool(agents: Agents, caller: string, params: unknown) {
	const { name, arguments: args = {} } = (params ?? {}) as { name?: string; arguments?: unknown };
	const tool = name && Object.hasOwn(tools, name) ? tools[name as keyof typeof tools] : null;
	if (!name || !tool || !available(agents, caller, name))
		return content(`Unknown tool: ${name}`, true);

	const input = v.safeParse(tool.input, args);
	if (!input.success)
		return content(`Invalid input: ${input.issues.map((issue) => issue.message).join('; ')}`, true);

	try {
		const run = tool.run as (agents: Agents, caller: string, input: unknown) => unknown;
		const result = await run(agents, caller, input.output);
		// text is for reading as it is; everything else is data
		return content(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
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
	// one request object at a time: no batches, nothing else
	if (typeof message !== 'object' || message === null || Array.isArray(message))
		return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
	const { id, method, params } = message;
	if (id === undefined) return null;

	switch (method) {
		case 'initialize': {
			const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
			return result(id, {
				protocolVersion: requested ?? '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'geordi', version: '1' },
				instructions: isExternal(caller)
					? EXTERNAL_INSTRUCTIONS
					: agents.isProject(caller)
						? PROJECT_INSTRUCTIONS
						: INSTRUCTIONS
			});
		}
		case 'ping':
			return result(id, {});
		case 'tools/list':
			return result(id, {
				tools: Object.entries(tools)
					.filter(([name]) => available(agents, caller, name))
					.map(([name, tool]) => ({
						name,
						description:
							typeof tool.description === 'function'
								? tool.description(agents.harnesses())
								: tool.description,
						inputSchema: toJsonSchema(tool.input)
					}))
			});
		case 'tools/call':
			return result(id, await callTool(agents, caller, params));
		default:
			return failure(id, -32601, `Method not found: ${method}`);
	}
}
