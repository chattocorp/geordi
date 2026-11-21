import { isHttpError } from '@sveltejs/kit';
import {
	AGENTS,
	CONFIG_FILE,
	CONFIG_SETTINGS,
	MODEL_SETTING,
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
import { MAX_NAMES, type createWorkspaces } from './workspaces.ts';

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
		`The \`${CONFIG_FILE}\` in a workspace's own directory, if it has one; otherwise the one on the branch work starts from (the upstream default branch, or the repository HEAD if there is no usable upstream default). The two are not merged. So you can try a change out in your workspace right away, and it applies to everyone once it is merged. The file is read again whenever it changes: nothing needs restarting.`,
		'## Checking',
		`After changing the file, call \`check_configuration\`: it reads the file the way Geordi does, and reports the effective settings. A parse error in the fallback file is treated as no applicable file.`
	].join('\n\n');

type CallerKind = 'repository' | 'project' | 'external';

const introduction = {
	repository:
		'You are running in a Geordi repository workspace. Use list_workspaces to discover workspaces you can read. If an external client started you or an ancestor, you inherit its repository access.',
	project:
		'You are running in a Geordi project. You can supervise agents in every repository and in your own project. Use list_workspaces to find them.',
	external:
		'You are connected to Geordi with a grant for selected repositories. Use list_repositories to find them. Agents you start inherit this access.'
};

const reportGuide =
	'An agent report gives the workspace id, parentId, agent kind, title, branch and sharesWorktree flag. Read status (running or idle), reply (text from the latest turn so far), and error (the latest reported error, or null). For its pull request and checks, call workspace_status.';

const controlledTarget = (kind: CallerKind) =>
	kind === 'project'
		? 'any agent in a repository or in your project'
		: 'an agent you started directly or through another agent';

const MAX_WAIT_SECONDS = 45;

const repositoryId = v.pipe(v.string(), v.description('Repository ID from list_repositories.'));
const workspaceId = v.pipe(v.string(), v.description('Workspace ID from list_workspaces.'));
const startFields = {
	prompt: v.pipe(
		v.string(),
		v.minLength(1),
		v.description(
			'The task and all the context the new agent needs. It starts a separate conversation.'
		)
	),
	agent: v.pipe(v.optional(v.picklist(AGENTS)), v.description('Which coding agent to run.')),
	model: v.pipe(
		v.optional(v.pipe(v.string(), v.regex(MODEL_SETTING, 'That is not a model'))),
		v.description('A model ID offered for the selected agent.')
	),
	effort: v.pipe(
		v.optional(v.pipe(v.string(), v.regex(SETTING, 'That is not an effort level'))),
		v.description('An effort level offered for the selected model.')
	),
	title: v.pipe(
		v.optional(v.pipe(v.string(), v.maxLength(80))),
		v.description('A short name for the task, shown in the workspace list.')
	)
};
const worktreeMode = v.optional(v.picklist(WORKTREE_MODES), 'own');
const startInput = v.strictObject({
	...startFields,
	repository: v.optional(repositoryId),
	worktree: worktreeMode,
	workspace: v.optional(workspaceId)
});

// Advertise the useful inputs for this caller. Keep parsing older calls with the full
// schema so the domain can still explain an invalid target or combination.
function startCatalogInput(kind: CallerKind) {
	if (kind === 'external')
		return v.strictObject({
			...startFields,
			repository: repositoryId,
			worktree: v.optional(v.literal('own'), 'own')
		});
	return startInput;
}

const startLocation = {
	repository:
		'The default, worktree "own", creates a branch from your current commit. Merge its branch to bring the work back. Use "shared" to work in your directory, including uncommitted files. To work in another repository, pass its ID from list_repositories and use "own". The branch starts from that repository’s base. Pass workspace instead to start a reviewer in your own worktree or in that of an agent you started directly or indirectly. This shares its files and branch regardless of worktree mode.',
	project:
		'Pass repository to start on a new branch from the repository base. Pass workspace to share that workspace’s directory and branch, regardless of worktree mode. With worktree "shared" and no workspace, the agent joins your project folder. The shared forms ignore repository.',
	external:
		'Supply repository from list_repositories. The agent gets a new worktree and branch from the repository base.'
};

/** Each tool: what agents are told about it, its input, and what it does for a caller. */
const tools = {
	start_agent: {
		description: (kind: CallerKind, agents: Agents) =>
			[
				'Start a coding agent and return its agent report immediately. Use wait_for_agent for the result.',
				startLocation[kind],
				kind === 'external'
					? `The agent defaults to ${agents.harnesses()?.[0]?.agent ?? AGENTS[0]} and its provider settings. You may have up to ${agents.limits.children} direct children running at once.`
					: `The agent defaults to your kind when available and inherits your model and compatible effort. A different kind uses its provider defaults. The maximum nesting depth is ${agents.limits.depth}. You may have up to ${agents.limits.children} direct children running at once.`,
				offersOf(agents.harnesses())
			].join('\n\n'),
		input: startInput,
		catalogInput: startCatalogInput,
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
		description: `Give your workspace a short name (a few words, no quotes or full stop) when you know what the work is. Rename it only if the task changes. You may name it up to ${MAX_NAMES} times. A name chosen by the person takes precedence. Returns the saved title.`,
		input: v.strictObject({ title: v.pipe(v.string(), v.minLength(1), v.maxLength(80)) }),
		run: (agents: Agents, caller: string, input: { title: string }) =>
			agents.name(caller, input.title)
	},
	wait_for_agent: {
		description:
			'Wait for a visible workspace to finish its current turn and return its agent report. For its pull request and checks, call workspace_status. If it is still running at timeout, check read_workspace.pendingQuestions for a blocking question that needs the person, then wait again as needed. An idle report can include an error.',
		input: v.strictObject({
			workspace_id: workspaceId,
			timeout_seconds: v.pipe(
				v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(600)), MAX_WAIT_SECONDS),
				v.description(
					'Seconds to wait. Zero returns immediately. The default and effective maximum are 45 seconds. Values through 600 are accepted and capped at 45.'
				)
			)
		}),
		run: (
			agents: Agents,
			caller: string,
			input: { workspace_id: string; timeout_seconds: number }
		) =>
			// Never longer than agent CLIs give a tool call (a minute): a wait that outlasts that
			// comes back as a failure, and tells the caller nothing.
			agents.wait(
				caller,
				input.workspace_id,
				Math.min(input.timeout_seconds, MAX_WAIT_SECONDS) * 1000
			)
	},
	list_agents: {
		description:
			'List agent reports for your unarchived descendants, including agents started by your agents. Use list_workspaces with include_archived for archived workspaces.',
		input: v.strictObject({}),
		run: (agents: Agents, caller: string) => agents.list(caller)
	},
	list_repositories: {
		description: (kind: CallerKind) =>
			kind === 'external'
				? 'List the repositories granted to your token, with id, name and local path.'
				: 'List the repositories you can access, with id, name and local path.',
		input: v.strictObject({}),
		run: (agents: Agents, caller: string) => agents.listRepositories(caller)
	},
	list_workspaces: {
		description:
			'List visible workspaces with id, repoId, title, url, branch, status and asking. A null repoId identifies a project workspace. Set include_archived to include archived entries.',
		input: v.strictObject({ include_archived: v.optional(v.boolean(), false) }),
		run: (agents: Agents, caller: string, input: { include_archived: boolean }) =>
			agents.listWorkspaces(caller, input.include_archived)
	},
	read_workspace: {
		description:
			'Read up to 50 messages in chronological order and all open questions in pendingQuestions. A user message with from identifies a workspace agent or named external client as its sender. Pass before to read the previous page. A null cursor marks the first page.',
		input: v.strictObject({
			workspace_id: workspaceId,
			before: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)))
		}),
		run: (agents: Agents, caller: string, input: { workspace_id: string; before?: number }) =>
			agents.readWorkspace(caller, input.workspace_id, input.before)
	},
	send_message: {
		description: (kind: CallerKind) =>
			[
				`Send a follow-up to ${kind === 'project' ? controlledTarget(kind) : 'another unarchived agent in a repository you can access'}. An idle agent starts a turn, processing any previously queued messages first. A running agent receives the message after its turn unless you set interrupt to steer the current turn.`,
				kind !== 'project' ? 'You may steer only your own direct or indirect descendants.' : '',
				'Returns the current agent report immediately. Use wait_for_agent for the reply.'
			]
				.filter(Boolean)
				.join(' '),
		input: v.strictObject({
			workspace_id: v.pipe(
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
			input: { workspace_id: string; message: string; interrupt: boolean }
		) => {
			agents.send(caller, input.workspace_id, input.message, input.interrupt);
			return agents.reportWorkspace(caller, input.workspace_id);
		}
	},
	archive_agent: {
		description: (kind: CallerKind) =>
			[
				`Archive ${controlledTarget(kind)}. Geordi also archives agents working in its directory and follows child workspaces within the same repository. Children in other repositories keep working.`,
				kind === 'project'
					? 'Archiving a project closes the agents in its folder and preserves the folder. Agents it started in repositories continue working.'
					: '',
				'If any affected agent is running, the whole request fails before archiving starts. Geordi processes children first, closes the terminals of each archived workspace, and removes it from the active list. When removing a worktree, Geordi ends agent sessions there and releases its ports. A worktree still in use stays in place. Branches and conversations are kept. MCP archiving skips the repository teardown script.',
				'Staged changes, unstaged changes and non-ignored untracked files block removal. Git-ignored untracked files go with the directory. If removal fails partway, earlier workspaces stay archived. Resolve the problem and retry the target. On success, archived contains the target ID.'
			]
				.filter(Boolean)
				.join(' '),
		input: v.strictObject({ workspace_id: workspaceId }),
		run: async (agents: Agents, caller: string, input: { workspace_id: string }) => {
			const agent = agents.get(caller, input.workspace_id);
			await agents.archive(caller, agent.id);
			return { archived: agent.id };
		}
	},
	configuration_reference: {
		description: `How to configure this repository for Geordi, in its ${CONFIG_FILE}: the settings there are and what they do. Read this before creating or changing that file.`,
		input: v.strictObject({}),
		run: () => configurationReference()
	},
	check_configuration: {
		description: `Read this workspace's ${CONFIG_FILE} the way Geordi does, and say which file applies, what it sets (including task defaults in the Tasks panel), and any problem in the workspace file. A parse error in the fallback file on the base branch is reported as no applicable file. Call this after changing the file.`,
		input: v.strictObject({}),
		run: async (agents: Agents, caller: string) => {
			const {
				default: target,
				tasks,
				source,
				file,
				problem,
				ports,
				jobs,
				urls,
				setup,
				teardown
			} = await agents.configuration(caller);
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
				...(tasks
					? {
							tasks: tasks.map((task) => ({
								...task,
								command: jobs.find((job) => job.name === task.name)?.command,
								url: urls.find((url) => url.name === task.name)?.href
							}))
						}
					: { default: target ?? null }),
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
		description: (kind: CallerKind) =>
			`Read Git changes, pull request, checks and suggested next steps for a visible repository worktree. ${kind === 'repository' ? 'Omit workspace_id for your own worktree.' : 'Supply the repository workspace ID as workspace_id.'} Projects have no Git standing. Upstream data can be absent or come from the last successful refresh, with no age bound. A step with a prompt can be sent to the workspace agent. Other steps are available to the person.`,
		input: v.strictObject({
			workspace_id: v.optional(workspaceId)
		}),
		catalogInput: (kind: CallerKind) =>
			v.strictObject({
				workspace_id: kind === 'repository' ? v.optional(workspaceId) : workspaceId
			}),
		run: async (agents: Agents, caller: string, input: { workspace_id?: string }) => {
			const workspace = agents.workspace(caller, input.workspace_id);
			const { changes, upstream } = await agents.standing(workspace.worktreeId);
			const state = {
				changes,
				upstream,
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
		description: (kind: CallerKind) =>
			`Request a stop of the current turn of ${controlledTarget(kind)}. An idle agent stays idle. Returns its agent report immediately, which can still say running. Use wait_for_agent to confirm the turn ended.`,
		input: v.strictObject({ workspace_id: workspaceId }),
		run: (agents: Agents, caller: string, input: { workspace_id: string }) => {
			agents.stop(caller, input.workspace_id);
			return agents.get(caller, input.workspace_id);
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
const available = (kind: CallerKind, name: string) =>
	kind === 'external'
		? !workspaceTools.has(name)
		: kind !== 'project' || !repositoryTools.has(name);

/**
 * What is wrong with a tool call, by parameter name. An unknown parameter is a mistake (a
 * misspelt `agent`, say), never something to ignore.
 */
function describeIssue(issue: v.BaseIssue<unknown>) {
	const name = issue.path?.map((item) => item.key).join('.');
	if (issue.type === 'strict_object')
		return issue.expected === 'never' ? `Unknown parameter ${name}` : `Missing parameter ${name}`;
	return name ? `${name}: ${issue.message}` : issue.message;
}

async function callTool(agents: Agents, caller: string, kind: CallerKind, params: unknown) {
	const { name, arguments: args = {} } = (params ?? {}) as { name?: string; arguments?: unknown };
	const tool = name && Object.hasOwn(tools, name) ? tools[name as keyof typeof tools] : null;
	if (!name || !tool || !available(kind, name)) return content(`Unknown tool: ${name}`, true);

	const input = v.safeParse(tool.input, args);
	if (!input.success)
		return content(`Invalid input: ${input.issues.map(describeIssue).join('; ')}`, true);

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

	const kind: CallerKind = isExternal(caller)
		? 'external'
		: agents.isProject(caller)
			? 'project'
			: 'repository';
	switch (method) {
		case 'initialize': {
			const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
			return result(id, {
				protocolVersion: requested ?? '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'geordi', version: '1' },
				instructions: [
					introduction[kind],
					reportGuide,
					'Call start_agent to delegate work and wait_for_agent with the returned id to follow its turn. When an agent you started ends a turn you are not waiting for, you get a message with its reply; a long task needs no repeated waits. Questions are for the person to answer. If the forge restarts, reconnect and continue waiting. Agents keep running.'
				].join(' ')
			});
		}
		case 'ping':
			return result(id, {});
		case 'tools/list':
			return result(id, {
				tools: Object.entries(tools)
					.filter(([name]) => available(kind, name))
					.map(([name, tool]) => ({
						name,
						description:
							typeof tool.description === 'function'
								? tool.description(kind, agents)
								: tool.description,
						inputSchema: toJsonSchema('catalogInput' in tool ? tool.catalogInput(kind) : tool.input)
					}))
			});
		case 'tools/call':
			return result(id, await callTool(agents, caller, kind, params));
		default:
			return failure(id, -32601, `Method not found: ${method}`);
	}
}
