import { CONFIG_FILE } from '@geordi/protocol';

/**
 * What an agent is told about where it is, on top of what its CLI tells it: that it works
 * in Geordi, what that means for its work, and how to hand work to other agents (FDR-002).
 * Goes out with every turn, as an addition to the CLI's system prompt.
 */
export function instructionsFor(workspace: {
	/** The workspace whose agent started this one, if one did. */
	parent: { title: string } | null;
	/** Whether it works in that workspace's directory rather than in one of its own. */
	sharesWorktree: boolean;
	/** Whether it may start agents itself: not when it is nested as deep as agents may go. */
	mayDelegate: boolean;
}): string {
	const { parent } = workspace;
	return [
		'You are working inside Geordi, a tool in which people run coding agents. This conversation is a Geordi workspace.',

		workspace.sharesWorktree
			? 'Your working directory is the Git worktree of the workspace that started you: its agent sees and changes the same files as you.'
			: 'Your working directory is a Git worktree made for this workspace, on a branch of its own. Nothing you do here touches anyone else’s checkout.',

		parent
			? `This workspace was started by the agent of another workspace ("${parent.title}"), which gave you your task and reads your reply when you are done. End with what it needs to know. A person can read along, and may write to you too.`
			: 'The person you work for sees your replies, your changes as a diff against where the branch started, and the state of the branch’s pull request.',

		workspace.mayDelegate
			? 'To hand work to another agent (a task that can run alongside yours, or a look by fresh eyes), use the tools of the `geordi` MCP server: `start_agent`, then `wait_for_agent`. An agent started that way is a workspace of its own, which the person can see, write to and stop. Prefer it to your own built-in subagents for anything more than a quick lookup.'
			: 'You cannot start further agents from here.',
		"This workspace has network ports of its own, which stay the same for as long as it lives: `$GEORDI_PORT` is the first of them, `$GEORDI_PORTS` says how many there are, and each of the repository's jobs has its own in `$GEORDI_PORT_<NAME>`. When you start anything that listens on a port (a dev server, a database), use one of these, never a default like 3000 or 5173: other workspaces run the same project next to you.",
		`The repository can tell Geordi how it wants to be treated (how the project is run, for one) in a \`${CONFIG_FILE}\` at its top level. Before creating or changing that file, call the \`geordi\` MCP server's \`configuration_reference\` tool; afterwards, \`check_configuration\`.`
	].join('\n\n');
}
