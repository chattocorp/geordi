import { error, isHttpError } from '@sveltejs/kit';
import {
	AGENTS,
	CONFIG_FILE,
	CONFIG_SETTINGS,
	SPARE_PORTS,
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
import type { createJobs } from './jobs.ts';
import { isExternal } from './agent-access.ts';
import { MAX_NAMES, type createWorkspaces } from './workspaces.ts';

/**
 * Geordi's agent API (ADR-004, FDR-002) as a Model Context Protocol server: the tools that
 * let agents work with Geordi workspaces. Stateless JSON-RPC over HTTP.
 */

/** What the tools work with: the agents API, and archiving (which needs a daemon). */
type Agents = ReturnType<typeof createWorkspaces>['agents'] & {
	jobs: Pick<ReturnType<typeof createJobs>, 'list' | 'run' | 'stop'>;
	/** Archives a workspace on the caller's behalf. Never discards uncommitted work. */
	archive(caller: string, id: string): Promise<void>;
	/** What the repository's configuration says for the caller's workspace, as a daemon reads it. */
	configuration(caller: string): Promise<RepoConfig>;
	/** How a worktree's work stands, as a daemon says. Rejects if none can. */
	standing(worktreeId: string): Promise<{ changes: Changes; upstream: Upstream | null }>;
	/** The models and effort levels on offer, per agent; `null` while no daemon is connected. */
	harnesses(): Harness[] | null;
	/** Measures the caller's work against another branch (`null`: the repository's main one). */
	setBase(caller: string, base: string | null): Promise<void>;
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
		`A repository tells Geordi how it wants to be treated in a file called \`${CONFIG_FILE}\`, at its top level. It is YAML. Settings Geordi doesn't know are ignored. (\`run\`, \`jobs\`, \`urls\`, \`default\` and \`ports\`, and a \`.geordi.toml\`, are no longer read: move what they say into \`tasks\` in \`${CONFIG_FILE}\`.)`,
		`Every workspace also has ${SPARE_PORTS} spare ports of its own, for anything an agent or a terminal starts: \`GEORDI_PORT\` is the first and \`GEORDI_PORTS\` says how many. Never hard-code a port: two workspaces would collide.`,
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
	'An agent report gives the workspace id, parentId, agent kind, title, branch and sharesWorktree flag. Read status (running or idle), reply (its latest message in the current or last turn: its answer once the turn is over), and error (the latest reported error, or null). For its pull request and checks, call workspace_status.';

const controlledTarget = (kind: CallerKind) =>
	kind === 'project'
		? 'any agent in a repository or in your project'
		: 'an agent that reports to you, directly or through another agent';

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
const base = v.pipe(
	v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
	v.description(
		"A branch for the new worktree to start from, such as your own to build on your committed work. Its changes are shown against this branch until it has a pull request. Omit it to start from the repository's base."
	)
);
const startInput = v.strictObject({
	...startFields,
	repository: v.optional(repositoryId),
	worktree: worktreeMode,
	base,
	workspace: v.optional(workspaceId),
	item: v.pipe(
		v.optional(v.string()),
		v.description(
			'The id of one of the items under your workspace to start it on: the item becomes its workspace, named after it, and the items under it become the new agent’s own checklist. The item must have no agents under it yet.'
		)
	),
	under: v.pipe(
		v.optional(v.string()),
		v.description(
			'The id of one of the items under your workspace to put the new workspace under (a heading grouping its work), instead of right under yours.'
		)
	)
});

// Advertise the useful inputs for this caller. Keep parsing older calls with the full
// schema so the domain can still explain an invalid target or combination.
function startCatalogInput(kind: CallerKind) {
	if (kind === 'external')
		return v.strictObject({
			...startFields,
			repository: repositoryId,
			worktree: v.optional(v.literal('own'), 'own'),
			base
		});
	return startInput;
}

const startLocation = {
	repository:
		'The default, worktree "own", creates a new branch from the repository’s base, or from base if you pass one (your own branch, to build on what you committed; then merge its branch to bring the work back). Use "shared" to work in your directory, including uncommitted files. To work in another repository, pass its ID from list_repositories and use "own". Pass workspace instead to start a reviewer in your own worktree or in that of an agent you started directly or indirectly. This shares its files and branch regardless of worktree mode. To hand one of the items under your workspace to the new agent, pass it as item; to file the new workspace under one of your items, pass under.',
	project:
		'Pass repository to start on a new branch from the repository base, or from base if you pass one. Pass workspace to share that workspace’s directory and branch, regardless of worktree mode. With worktree "shared" and no workspace, the agent joins your project folder. The shared forms ignore repository.',
	external:
		'Supply repository from list_repositories. The agent gets a new worktree and branch from the repository base, or from base if you pass one.'
};

const taskInput = v.strictObject({
	name: v.pipe(v.string(), v.description('Task name from list_tasks.'))
});

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
				base?: string;
				workspace?: string;
				agent?: (typeof AGENTS)[number];
				model?: string;
				effort?: string;
				title?: string;
				item?: string;
				under?: string;
			}
		) => agents.start(caller, input, agents.harnesses())
	},
	list_items: {
		description:
			"Read the items under your workspace in the person's outline: a checklist you keep, which the person may add to. Each has an id, its parentId (null: right under your workspace), its text, whether it is done, and how deep it is (0: right under your workspace). Agents working under yours are listed as lines of their own, with how many of their own items are done; their items are theirs. path names the items above your workspace.",
		input: v.strictObject({}),
		run: (agents: Agents, caller: string) => agents.items(caller)
	},
	add_item: {
		description:
			'Write an item under your workspace in the outline: something still to be done here, for the person to follow. It goes right under your workspace, or under one of your items (under); last there, or right above one of the items there (before). Keep items few and meaningful; they are not your scratch plan. Returns its id.',
		input: v.strictObject({
			text: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
			under: v.pipe(
				v.optional(v.string()),
				v.description('The id of one of your items to put it under.')
			),
			before: v.pipe(
				v.optional(v.string()),
				v.description('The id of one of your items to put it right above, under the same item.')
			)
		}),
		run: (
			agents: Agents,
			caller: string,
			input: { text: string; under?: string; before?: string }
		) => agents.addItem(caller, input)
	},
	move_item: {
		description:
			'Move one of the items under your workspace, with what is under it: right under your workspace (omit under), or under another of your items (under); last there, or right above one of the items there (before). Use it to keep your items in order, or to group them under a heading you add. Returns where it is now.',
		input: v.strictObject({
			id: v.pipe(v.string(), v.description('The item’s id, as list_items gives it.')),
			under: v.pipe(
				v.optional(v.string()),
				v.description('The id of one of your items to move it under.')
			),
			before: v.pipe(
				v.optional(v.string()),
				v.description('The id of one of your items to move it right above, under the same item.')
			)
		}),
		run: (agents: Agents, caller: string, input: { id: string; under?: string; before?: string }) =>
			agents.moveItem(caller, input.id, { under: input.under, before: input.before })
	},
	update_item: {
		description:
			'Change one of the items under your workspace: tick it off when it is done (done: true), the person’s too, or change its text.',
		input: v.strictObject({
			id: v.pipe(v.string(), v.description('The item’s id, as list_items gives it.')),
			text: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(500))),
			done: v.optional(v.boolean())
		}),
		run: (agents: Agents, caller: string, input: { id: string; text?: string; done?: boolean }) =>
			agents.updateItem(caller, input.id, { text: input.text, done: input.done })
	},
	remove_item: {
		description:
			'Remove one of the items under your workspace, with what is under it: one that turned out not to be needed. Tick off what is done instead of removing it.',
		input: v.strictObject({
			id: v.pipe(v.string(), v.description('The item’s id, as list_items gives it.'))
		}),
		run: (agents: Agents, caller: string, input: { id: string }) => {
			agents.removeItem(caller, input.id);
			return { removed: input.id };
		}
	},
	name_workspace: {
		description: `Give your workspace a short name (a few words, no quotes or full stop) when you know what the work is. Rename it only if the task changes. You may name it up to ${MAX_NAMES} times. A name chosen by the person takes precedence. Returns the saved title.`,
		input: v.strictObject({ title: v.pipe(v.string(), v.minLength(1), v.maxLength(80)) }),
		run: (agents: Agents, caller: string, input: { title: string }) =>
			agents.name(caller, input.title)
	},
	set_base: {
		description:
			"Say which branch your work is compared with (what your workspace's changes are shown against). It is the branch your worktree started from. Call this after you move your branch onto another one (such as with git rebase --onto), and only then: it does not move your branch. Omit branch to compare with the repository's main branch. Once your branch has a pull request, its target branch is used instead.",
		input: v.strictObject({
			branch: v.pipe(
				v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
				v.description(
					'A branch on your repository’s upstream (push yours first), or a local one where it has no upstream.'
				)
			)
		}),
		run: async (agents: Agents, caller: string, input: { branch?: string }) => {
			await agents.setBase(caller, input.branch ?? null);
			return `Your work is now compared with ${input.branch ?? "the repository's main branch"}, until it has a pull request.`;
		}
	},
	wait_for_agent: {
		description:
			'Wait for a visible workspace to finish its current turn and return its agent report. For its pull request and checks, call workspace_status. A direct child returns early with parentQuestions when it needs your decision. If another direct child needs a decision, childrenAsking gives its workspace ID. Use list_agents to read the requests, then answer_question or forward_question. An idle report can include an error. movedAway means a person moved it under another workspace or to the top level: it is no longer yours to supervise.',
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
			'List visible workspaces with id, repoId, title, url, branch, status, asking and inactive. A null repoId identifies a project workspace. inactive means the person put the workspace aside for later; only the person changes it. Set include_archived to include archived entries.',
		input: v.strictObject({ include_archived: v.optional(v.boolean(), false) }),
		run: (agents: Agents, caller: string, input: { include_archived: boolean }) =>
			agents.listWorkspaces(caller, input.include_archived)
	},
	read_workspace: {
		description:
			'Read the conversation as turns, the latest page first (oldest turn first within a page), and all open questions in pendingQuestions. Each turn gives the message the agent was told (null where it began the turn itself; from names a workspace agent or named external client that sent it), its final reply, its error and the questions it asked. What it said on the way and its tool calls are left out. A page holds up to 50 turns and about 10k tokens; very long texts are cut. Pass the returned before to read the earlier page; it is null once the page reaches the start of the conversation.',
		input: v.strictObject({
			workspace_id: workspaceId,
			before: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)))
		}),
		run: (agents: Agents, caller: string, input: { workspace_id: string; before?: number }) =>
			agents.readWorkspace(caller, input.workspace_id, input.before)
	},
	answer_question: {
		description:
			'Answer a blocking request addressed to you by your direct child. Pass the request ID and one answer string per question in order. Geordi delivers your answer to the waiting child.',
		input: v.strictObject({
			workspace_id: workspaceId,
			question_id: v.string(),
			answers: v.pipe(v.array(v.pipe(v.string(), v.maxLength(10000))), v.maxLength(20))
		}),
		run: (
			agents: Agents,
			caller: string,
			input: { workspace_id: string; question_id: string; answers: string[] }
		) => {
			agents.answerQuestion(caller, input.workspace_id, input.question_id, input.answers);
			return { question_id: input.question_id, status: 'answered' };
		}
	},
	forward_question: {
		description:
			'Pass a blocking request from your direct child to the person in your workspace. Pass its existing ID. The person answers the child directly. Leave the request text out of chat.',
		input: v.strictObject({ workspace_id: workspaceId, question_id: v.string() }),
		run: (agents: Agents, caller: string, input: { workspace_id: string; question_id: string }) => {
			agents.forwardQuestion(caller, input.workspace_id, input.question_id);
			return { question_id: input.question_id, status: 'forwarded' };
		}
	},
	send_message: {
		description: (kind: CallerKind) =>
			[
				`Send a follow-up to ${
					kind === 'project'
						? controlledTarget(kind)
						: kind === 'external'
							? 'another unarchived agent in a repository you can access'
							: 'an unarchived agent that reports to you (directly or through another agent), or to the agent you report to'
				}. An idle agent starts a turn, processing any previously queued messages first. Within a delegation, a running agent receives the message during its current turn. Set interrupt to false to queue it for the next turn. Providers without live steering queue it automatically.`,
				kind === 'external'
					? 'You may steer only your own direct or indirect descendants. Messages to other running agents are queued.'
					: '',
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
				v.optional(v.boolean()),
				v.description(
					'Set false to queue a follow-up for the next turn. Set true to steer a running agent. By default, messages steer within a delegation and queue elsewhere.'
				)
			)
		}),
		run: (
			agents: Agents,
			caller: string,
			input: { workspace_id: string; message: string; interrupt?: boolean }
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
				'If any affected workspace is locked or its agent is running, the whole request fails before archiving starts. Only the person can lock or unlock a workspace. Geordi processes children first, closes the terminals of each archived workspace, and removes it from the active list. When removing a worktree, Geordi ends agent sessions there and releases its ports. A worktree still in use stays in place. Branches and conversations are kept. MCP archiving skips the repository teardown script.',
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
	list_tasks: {
		description:
			'List the configured tasks in your current worktree, including commands, approvals, dependencies, resolved links and whether each command is running.',
		input: v.strictObject({}),
		run: (agents: Agents, caller: string) => agents.jobs.list(agents.workspace(caller).worktreeId)
	},
	run_task: {
		description:
			'Run a task from list_tasks and its dependencies in your current worktree. Commands require prior approval by the person. Returns its link when ready, or a problem or port conflict.',
		input: taskInput,
		run: async (agents: Agents, caller: string, { name }: { name: string }) => {
			const id = agents.workspace(caller).worktreeId;
			const { tasks, problem } = await agents.configuration(id);
			if (problem) error(400, problem);
			const seen = Object.fromEntries(
				tasks.flatMap((task) => (task.command === null ? [] : [[task.name, task.command]]))
			);
			const [result] = await agents.jobs.run(id, [name], seen);
			return result;
		}
	},
	stop_task: {
		description:
			'Stop a configured task in your current worktree and any running tasks that depend on it.',
		input: taskInput,
		run: async (agents: Agents, caller: string, { name }: { name: string }) => {
			const id = agents.workspace(caller).worktreeId;
			const { tasks, problem } = await agents.configuration(id);
			if (problem) error(400, problem);
			if (!tasks.some((task) => task.name === name)) error(404, 'Unknown task');
			await agents.jobs.stop(id, name);
			return { stopped: name };
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
			const { tasks, source, file, problem, ports, setup, teardown, sections } =
				await agents.configuration(caller);
			const commands = [
				...tasks.filter((task) => task.command !== null),
				...(setup ? [setup] : []),
				...(teardown ? [teardown] : [])
			];
			return {
				applies:
					source === 'workspace'
						? `the ${file ?? CONFIG_FILE} in your working directory`
						: source === 'base'
							? `the ${CONFIG_FILE} on the branch work starts from (your working directory has none)`
							: `none: there is no ${CONFIG_FILE}`,
				tasks: tasks.map(({ name, label, command, ports, href, needs, default: selected }) => ({
					name,
					label,
					command,
					ports,
					url: href,
					needs,
					default: selected
				})),
				problem,
				spare_ports: ports,
				setup: setup?.command ?? null,
				teardown: teardown?.command ?? null,
				...(sections?.length && { sections }),
				...(commands.some((command) => !command.approved) && {
					note: 'Nobody has agreed to run some of these commands yet. The person is shown them and asked before they first run; you cannot agree on their behalf.'
				})
			};
		}
	},
	workspace_status: {
		description: (kind: CallerKind) =>
			`Read Git changes, pull request, checks and suggested next steps for a visible repository worktree. ${kind === 'repository' ? 'Omit workspace_id for your own worktree.' : 'Supply the repository workspace ID as workspace_id.'} inactive says whether the person put the workspace aside for later. Projects have no Git standing. Upstream data can be absent or come from the last successful refresh, with no age bound. A step with a prompt can be sent to the workspace agent. Other steps are available to the person.`,
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
				child: !!workspace.parentId,
				locked: workspace.locked
			};
			const pull = upstream?.pull;
			return {
				id: workspace.id,
				title: workspace.title,
				status: workspace.status,
				// a person put it aside for later; only they change that
				inactive: workspace.inactive,
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

/** What is about a workspace's repository, which a project has none of (FDR-012). */
const repositoryTools = new Set([
	'set_base',
	'configuration_reference',
	'check_configuration',
	'list_tasks',
	'run_task',
	'stop_task'
]);
/** What only an agent in a workspace can use: it is about that workspace. */
const workspaceTools = new Set([
	...repositoryTools,
	'answer_question',
	'forward_question',
	'name_workspace',
	// its items in the outline (FDR-017)
	'list_items',
	'add_item',
	'update_item',
	'move_item',
	'remove_item'
]);
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
					'Call start_agent to delegate work and wait_for_agent with the returned id to follow its turn. When an agent you started ends a turn you are not waiting for, you get a message with its reply; a long task needs no repeated waits. A direct child can return parentQuestions. Use answer_question or forward_question. If the forge restarts, reconnect and continue waiting. Agents keep running.'
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
