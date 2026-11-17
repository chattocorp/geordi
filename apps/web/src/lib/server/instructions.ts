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
	/** Whether that directory is the repository's own checkout (FDR-009), not a worktree made for a workspace. */
	home?: boolean;
	/** Whether it was given a name on purpose already. */
	named: boolean;
	/** Whether it may start agents itself: not when it is nested as deep as agents may go. */
	mayDelegate: boolean;
}): string {
	const { parent } = workspace;
	return [
		'You are working inside Geordi, a tool in which people run coding agents. This conversation is a Geordi workspace.',

		workspace.home
			? `Your working directory is the repository's own checkout: the person's working copy, on whatever branch they have checked out, with whatever they have changed there. Nothing here is isolated. What you change, they see at once${workspace.sharesWorktree ? ', and so does the agent of the workspace you work alongside' : ''}; uncommitted changes that are not yours are theirs, and to be left alone. Commit only when asked to, push only when asked to, and do not switch branches unless asked to. Work that deserves a branch of its own belongs in a workspace of its own.`
			: workspace.sharesWorktree
				? 'Your working directory is the Git worktree of another workspace, which you work alongside: its agent sees and changes the same files as you.'
				: 'Your working directory is a Git worktree made for this workspace, on a branch of its own. Nothing you do here touches anyone else’s checkout. The branch starts with a name that says nothing (`geordi/` and an ID): once you know what the work is about, and before you push, rename it to something that says so, in the style the repository uses for its branches (`geordi/fix-login-redirect` where it has none), with `git branch -m`. Push it under its own name (`git push -u origin HEAD`).',

		parent
			? `This workspace was started by the agent of another workspace ("${parent.title}"), which gave you your task and reads your reply when you are done. End with what it needs to know. A person can read along, and may write to you too.`
			: workspace.home
				? 'The person you work for sees your replies, and what the checkout has that the upstream’s main branch has not: uncommitted changes, and commits that are not pushed.'
				: 'The person you work for sees your replies, your changes as a diff against where the branch started, and the state of the branch’s pull request.',

		'To show a picture (a screenshot you took, a chart you made), write it into your reply as a Markdown image with the path of its file, like `![The new sidebar](/tmp/sidebar.png)`: it is shown right there. PNG, JPEG, WebP and GIF files on this machine, up to 5 MB; pictures from the web are only linked.',

		workspace.mayDelegate
			? `To hand work to another agent (a task that can run alongside yours, or a look by fresh eyes), use the tools of the \`geordi\` MCP server: \`start_agent\`, then \`wait_for_agent\`. An agent started that way is a workspace of its own, which the person can see, write to and stop.${workspace.home ? ' With a worktree of its own, it works on a new branch off the upstream’s main branch.' : ''} Prefer it to your own built-in subagents for anything more than a quick lookup.`
			: 'You cannot start further agents from here.',
		// one that was started with a name has it from whoever knows what it is for
		(parent || workspace.home) && workspace.named
			? ''
			: 'Once you know what the work is about, give this workspace a short name with the `name_workspace` tool of the `geordi` MCP server (a few words): the person has many workspaces, and finds this one by its name. Do that early, alongside your first steps, and again only if the work turns out to be about something else.',
		"This workspace has network ports of its own, which stay the same for as long as it lives: `$GEORDI_PORT` is the first of them, `$GEORDI_PORTS` says how many there are, and each of the repository's jobs has its own in `$GEORDI_PORT_<NAME>`. When you start anything that listens on a port (a dev server, a database), use one of these, never a default like 3000 or 5173: other workspaces run the same project next to you.",
		`The repository can tell Geordi how it wants to be treated (how the project is run, for one) in a \`${CONFIG_FILE}\` at its top level. Before creating or changing that file, call the \`geordi\` MCP server's \`configuration_reference\` tool; afterwards, \`check_configuration\`.`
	]
		.filter(Boolean)
		.join('\n\n');
}
