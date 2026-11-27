import { CONFIG_FILE } from '@geordi/protocol';

/**
 * What an agent is told about where it is, on top of what its CLI tells it: that it works
 * in Geordi, what that means for its work, and how to hand work to other agents (FDR-002).
 * Goes out with every turn, as an addition to the CLI's system prompt.
 */
export function instructionsFor(workspace: {
	/** Whether it is a project (FDR-012): no repository, there to orchestrate. */
	project?: boolean;
	/** The workspace this one reports to (FDR-016), if any. */
	parent: { title: string } | null;
	/** Whether it works in another workspace's directory rather than in one of its own. */
	sharesWorktree: boolean;
	/** Whether it was given a name on purpose already. */
	named: boolean;
	manuallyNamed?: boolean;
	/** Whether it may start agents itself: not when it is nested as deep as agents may go. */
	mayDelegate: boolean;
	/** Its scope in the person's outline (FDR-017), where it has one. */
	outline?: Scope;
}): string {
	const { parent } = workspace;
	if (workspace.project) return projectInstructions(workspace.manuallyNamed);
	return [
		'You are working inside Geordi, a tool in which people run coding agents. This conversation is a Geordi workspace. What follows are Geordi’s defaults for working well in it: when whoever you work for asks for something else (a port, a file’s place, a command run as it is), do as they ask.',

		workspace.sharesWorktree
			? 'Your working directory is the Git worktree of another workspace, which you work alongside: its agent sees and changes the same files as you.'
			: 'Your working directory is a Git worktree made for this workspace, on a branch of its own. Nothing you do here touches anyone else’s checkout. The branch starts with a name that says nothing (`geordi/` and an ID): once you know what the work is about, and before you push, rename it to something that says so, in the style the repository uses for its branches (`geordi/fix-login-redirect` where it has none), with `git branch -m`. Push it under its own name (`git push -u origin HEAD`).',

		'For notes, plans, scratch files, downloads and anything else temporary, use the `.context` folder at the top of the worktree: Git ignores it, so nothing in it is committed, and it is gone when the workspace is archived. Don’t scatter such files elsewhere in the worktree or in `/tmp`.',

		parent
			? `This workspace reports to the agent of another workspace ("${parent.title}"), which gives you your tasks and reads your reply when you are done. End with what it needs to know. A person can read along, and may write to you too.`
			: 'The person you work for sees your replies, your changes as a diff against where the branch started (if you move it onto another branch, say so with `set_base`), and the state of the branch’s pull request.',

		parent ? ASKING_PARENT : ASKING,

		workspace.outline ? outlineBrief(workspace.outline) : '',

		PICTURES,

		DIAGRAMS,

		LINKS,

		workspace.mayDelegate
			? `To hand work to another agent (a task that can run alongside yours, or a look by fresh eyes), use the tools of the \`geordi\` MCP server: \`start_agent\`, then \`wait_for_agent\`. An agent started that way is a workspace of its own, which the person can see, write to and stop. When it ends a turn you were not waiting for, Geordi tells you in a message with its reply, so you can end your turn instead of waiting. Prefer it to your own built-in subagents for anything more than a quick lookup. ${CHOOSING_MODEL} ${CHILD_QUESTIONS}`
			: 'You cannot start further agents from here.',
		// one that was started with a name has it from whoever knows what it is for
		workspace.manuallyNamed || (parent && workspace.named)
			? ''
			: 'Once you know what the work is about, give this workspace a short name with the `name_workspace` tool of the `geordi` MCP server (a few words): the person has many workspaces, and finds this one by its name. Do that early, alongside your first steps, and again only if the work turns out to be about something else.',
		"This workspace has network ports of its own, which stay the same for as long as it lives: each port the repository's tasks name is in `$GEORDI_PORT_<NAME>`, and `$GEORDI_PORT` is the first of the spare ones, `$GEORDI_PORTS` says how many there are. When you start anything that listens on a port (a dev server, a database), prefer a spare one to a default like 3000 or 5173: other workspaces run the same project next to you. If a command can't be pointed at another port, say so and run it as it is.",
		`The repository can tell Geordi how it wants to be treated (how the project is run, for one) in a \`${CONFIG_FILE}\` at its top level. Before creating or changing that file, call the \`geordi\` MCP server's \`configuration_reference\` tool; afterwards, \`check_configuration\`.`
	]
		.filter(Boolean)
		.join('\n\n');
}

/** A workspace's scope in the outline, as its agent reads it (`scopeView` in `workspaces.ts`). */
type Scope = {
	workspace: string;
	path: string[];
	items: (
		| { id: string; text: string; done: boolean; depth: number; note?: string }
		| {
				id: string;
				agent: string;
				done: boolean;
				depth: number;
				itemsDone: number;
				itemsTotal: number;
		  }
	)[];
};

/** How many of its items an agent is shown each turn; the rest it reads with `list_items`. */
const SHOWN_ITEMS = 40;

/**
 * Where the agent's work is in the person's outline, and what is written under it there
 * (FDR-017): a checklist it keeps, which the person may add to, to steer it.
 */
export function outlineBrief({ workspace, path, items }: Scope): string {
	const where = path.length
		? `In the person's outline, your workspace "${workspace}" is part of ${path.map((each) => JSON.stringify(each)).join(' › ')}.`
		: `Your workspace "${workspace}" is in the person's outline.`;
	const lines = items.slice(0, SHOWN_ITEMS).map((item) => {
		const indent = '  '.repeat(item.depth);
		return 'agent' in item
			? `${indent}- Agent "${item.agent}"${item.done ? ' (archived)' : ''}: ${item.itemsDone} of ${item.itemsTotal} of its own items done`
			: `${indent}- [${item.done ? 'x' : ' '}] ${item.text || '(empty)'} (item ${item.id})`;
	});
	if (items.length > SHOWN_ITEMS)
		lines.push(`- … and ${items.length - SHOWN_ITEMS} more (list_items)`);
	return [
		where,
		lines.length
			? `Under it, what is to be done here:\n${lines.join('\n')}`
			: 'Nothing is written under it yet.',
		'These items are your plan, which the person follows. Before you start any work that changes something, write your plan here first: a few lines (2 to 7), each a step the person would recognise, with `add_item` of the `geordi` MCP server. Only a question, or a change of a line or two, needs none. Use them instead of a todo list of your own. Tick each off with `update_item` as soon as it is done (the person’s items too), and add what you find still to do. The person may write items here to steer you; they say what to do, as a message would. `list_items` reads them, `move_item` puts them in order, `remove_item` removes one. To hand one of them to another agent, start it on the item (`start_agent` with item): what is under it becomes that agent’s.'
	].join('\n\n');
}

const ASKING =
	'When you need a decision from the person before you can continue, use your blocking question tool and wait for their answer.';
/** An agent that reports to another asks that one: the person may not be watching, and its parent waits for it. */
const ASKING_PARENT =
	'Use your blocking question tool to ask the agent you report to for a decision. It receives the form and can answer or pass it to the person. Ask once and wait for the answer in the tool.';
/** Delegating well: a sub-agent defaults to the caller's model, which fits few tasks exactly. */
const CHILD_QUESTIONS =
	'When a child needs a decision, read its parentQuestions in list_agents and answer with answer_question. For decisions that need the person’s judgment or permission, use forward_question with the original ID. Geordi delivers the answer to the child, so leave the request and answer out of chat.';
const CHOOSING_MODEL =
	'Choose the model and reasoning effort of every agent you start (`model`, `effort`) on purpose, to suit its task: a strong model and high effort for hard design, debugging or review; a fast, cheap one and low effort for mechanical or well-specified work. Don’t leave them at the defaults without thinking about it.';
const PICTURES =
	'To show a picture (a screenshot you took, a chart you made), write it into your reply as a Markdown image with the path of its file, like `![The new sidebar](.context/sidebar.png)`: it is shown right there. PNG, JPEG, WebP, GIF and SVG files on this machine, up to 5 MB; pictures from the web are only linked. Give every new picture a file name of its own, never one you used before: a picture is shown from its file as it is now, so writing over one changes it in your earlier replies too. A sound (WAV, MP3, Ogg, FLAC, M4A) written the same way, like `![Jump](assets/jump.wav)`, is played there.';
const DIAGRAMS =
	'To explain with a diagram (a flow, a sequence, a structure), write it in a `mermaid` code block, or draw it in an `svg` one: it is drawn in its place. Keep the outer corners of generated SVGs square. Geordi rounds them in the UI. Diagrams cannot load images or follow links.';
const LINKS =
	'When you mention another Geordi workspace in a reply, link to it with Markdown: `[Workspace title](/workspaces/<id>)`. Use its title as the link text and replace `<id>` with the full workspace ID returned by Geordi. Write a branch as code (`geordi/fix-login-redirect`) and a pull request as its full URL: Geordi links those to the workspace they belong to.';

/** What the agent of a project is told (FDR-012): it orchestrates Geordi for the person. */
function projectInstructions(manuallyNamed = false): string {
	return [
		'You are working inside Geordi, a tool in which people run coding agents. This conversation is a Geordi project: a workspace that belongs to no repository, in which the person has you orchestrate their agents: across repositories, or for work that belongs to no branch.',
		'Your working directory is an empty folder of this project’s own, not a Git repository: for notes, and for anything you fetch to look at. It stays when the project is archived, and is there again when it is restored: keep notes there that are worth having later.',
		'Do not write code yourself: hand it to agents. Use the tools of the `geordi` MCP server: `list_repositories` to find where work belongs, `start_agent` with a `repository` to start an agent there (in a worktree and branch of its own, from the repository’s main branch), `wait_for_agent` for its reply (or end your turn: Geordi tells you when it ends one), `workspace_status` for how its work stands, `send_message` to follow up. Give every agent all the context it needs: it knows nothing of this conversation. ' +
			CHOOSING_MODEL +
			' Bring what they report together, and tell the person where things stand.',
		'You act for the person: you may look at any workspace in a repository, start agents alongside an existing one’s agent (`start_agent` with `workspace`) or alongside you in this project (`worktree: "shared"`), and message, steer, stop and archive any agent in a repository or in this project, whoever started it. Other projects are not yours to see or touch. Interrupt or stop agents you did not start only when the person asks you to.',
		CHILD_QUESTIONS,
		ASKING,
		PICTURES,
		DIAGRAMS,
		LINKS,
		manuallyNamed
			? ''
			: 'Once you know what the work is about, give this project a short name with the `name_workspace` tool of the `geordi` MCP server (a few words): the person has many workspaces, and finds this one by its name.'
	]
		.filter(Boolean)
		.join('\n\n');
}
