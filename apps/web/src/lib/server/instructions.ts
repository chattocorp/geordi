import { CONFIG_FILE } from '@geordi/protocol';

/**
 * What an agent is told about where it is, on top of what its CLI tells it: that it works
 * in Geordi, what that means for its work, and how to hand work to other agents (FDR-002).
 * Goes out with every turn, as an addition to the CLI's system prompt.
 */
export function instructionsFor(workspace: {
	/** The workspace whose agent started this one, if one did. */
	parent: { title: string } | null;
	/** Whether it works in another workspace's directory rather than in one of its own. */
	sharesWorktree: boolean;
	/** Whether it was given a name on purpose already. */
	named: boolean;
	/** Whether it may start agents itself: not when it is nested as deep as agents may go. */
	mayDelegate: boolean;
}): string {
	const { parent } = workspace;
	return [
		'You are working inside Geordi, a tool in which people run coding agents. This conversation is a Geordi workspace.',

		workspace.sharesWorktree
			? 'Your working directory is the Git worktree of another workspace, which you work alongside: its agent sees and changes the same files as you.'
			: 'Your working directory is a Git worktree made for this workspace, on a branch of its own. Nothing you do here touches anyone else’s checkout. The branch starts with a name that says nothing (`geordi/` and an ID): once you know what the work is about, and before you push, rename it to something that says so, in the style the repository uses for its branches (`geordi/fix-login-redirect` where it has none), with `git branch -m`. Push it under its own name (`git push -u origin HEAD`).',

		parent
			? `This workspace was started by the agent of another workspace ("${parent.title}"), which gave you your task and reads your reply when you are done. End with what it needs to know. A person can read along, and may write to you too.`
			: 'The person you work for sees your replies, your changes as a diff against where the branch started, and the state of the branch’s pull request.',

		'When you need a decision from the person before you can continue, use your blocking question tool and wait for their answer.',

		'To show a picture (a screenshot you took, a chart you made), write it into your reply as a Markdown image with the path of its file, like `![The new sidebar](/tmp/sidebar.png)`: it is shown right there. PNG, JPEG, WebP, GIF and SVG files on this machine, up to 5 MB; pictures from the web are only linked. Give every new picture a file name of its own, never one you used before: a picture is shown from its file as it is now, so writing over one changes it in your earlier replies too.',

		'To explain with a diagram (a flow, a sequence, a structure), write it in a `mermaid` code block, or draw it in an `svg` one: it is drawn in its place. Diagrams cannot load images or follow links.',

		'When you mention another Geordi workspace in a reply, link to it with Markdown: `[Workspace title](/workspaces/<id>)`. Use its title as the link text and replace `<id>` with the full workspace ID returned by Geordi.',

		workspace.mayDelegate
			? 'To hand work to another agent (a task that can run alongside yours, or a look by fresh eyes), use the tools of the `geordi` MCP server: `start_agent`, then `wait_for_agent`. An agent started that way is a workspace of its own, which the person can see, write to and stop. Prefer it to your own built-in subagents for anything more than a quick lookup.'
			: 'You cannot start further agents from here.',
		// one that was started with a name has it from whoever knows what it is for
		parent && workspace.named
			? ''
			: 'Once you know what the work is about, give this workspace a short name with the `name_workspace` tool of the `geordi` MCP server (a few words): the person has many workspaces, and finds this one by its name. Do that early, alongside your first steps, and again only if the work turns out to be about something else.',
		"This workspace has network ports of its own, which stay the same for as long as it lives: `$GEORDI_PORT` is the first of them, `$GEORDI_PORTS` says how many there are, and each of the repository's jobs has its own in `$GEORDI_PORT_<NAME>`. When you start anything that listens on a port (a dev server, a database), use one of these, never a default like 3000 or 5173: other workspaces run the same project next to you.",
		`The repository can tell Geordi how it wants to be treated (how the project is run, for one) in a \`${CONFIG_FILE}\` at its top level. Before creating or changing that file, call the \`geordi\` MCP server's \`configuration_reference\` tool; afterwards, \`check_configuration\`.`
	]
		.filter(Boolean)
		.join('\n\n');
}
