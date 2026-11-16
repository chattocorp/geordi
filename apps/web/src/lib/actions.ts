import type { Changes, Upstream } from '@geordi/protocol';

/**
 * What could or should happen next in a workspace (FDR-003), worked out from where its
 * changes and its pull request stand. Most actions are a message to the workspace's agent;
 * merging and archiving are things Geordi does itself.
 */
export type WorkspaceAction = {
	id:
		| 'commit'
		| 'create-pull'
		| 'update-pull'
		| 'fix-checks'
		| 'address-review'
		| 'merge-pull'
		| 'restore-worktree'
		| 'archive';
	label: string;
	/** An Iconify class. */
	icon: string;
	/** What to say to the agent. Absent for actions Geordi carries out itself. */
	prompt?: string;
};

type State = {
	/** `null` while unknown (no daemon, or not asked yet). */
	changes: Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> | null;
	/** `null` if the repository is not on a forge we know, or not asked yet. */
	upstream: Upstream | null;
};

/**
 * The actions that make sense now, the most pressing first. The first one is what the UI
 * presents as *the* next step.
 */
export function actionsFor({ changes, upstream }: State): WorkspaceAction[] {
	if (!changes) return [];
	const uncommitted = changes.uncommitted > 0;
	// committed work that the remote doesn't have: commits ahead of it, or a branch not there at all
	const unpushed = changes.unpushed === null ? changes.files.length > 0 : changes.unpushed > 0;
	const local = uncommitted || unpushed;
	const pull = upstream?.pull;

	// Without a forge to send work to, committing is as far as it goes.
	if (!upstream)
		return uncommitted
			? [
					{
						id: 'commit',
						label: 'Commit',
						icon: 'icon-[lucide--git-commit-horizontal]',
						prompt: 'Commit the uncommitted changes, with clear commit messages.'
					}
				]
			: [];

	if (!pull || pull.state === 'unknown')
		return local
			? [
					{
						id: 'create-pull',
						label: 'Create PR',
						icon: 'icon-[lucide--git-pull-request-create]',
						prompt:
							'Commit any uncommitted changes with clear commit messages, push this branch, and open a pull request for it. Give it a title and a description that explain the change and why. Reply with the pull request’s URL.'
					}
				]
			: [];

	const archive: WorkspaceAction = {
		id: 'archive',
		label: 'Archive',
		icon: 'icon-[lucide--archive]'
	};
	if (pull.state === 'merged' || pull.state === 'closed') return [archive];

	const number = `pull request #${pull.number}`;
	const actions: WorkspaceAction[] = [];
	if (pull.checks?.state === 'failure')
		actions.push({
			id: 'fix-checks',
			label: 'Fix errors',
			icon: 'icon-[lucide--wrench]',
			prompt: `The checks on ${number} are failing. Find out which and why, fix the cause, then commit and push.`
		});
	if (pull.review === 'changes_requested')
		actions.push({
			id: 'address-review',
			label: 'Address review',
			icon: 'icon-[lucide--message-square-reply]',
			prompt: `Changes were requested on ${number}. Read the review comments and address them, then commit and push. Reply to comments where that helps the reviewer.`
		});
	if (local)
		actions.push({
			id: 'update-pull',
			label: 'Update PR',
			icon: 'icon-[lucide--git-pull-request-arrow]',
			prompt: `Commit any uncommitted changes with clear commit messages and push them to ${number}. Update its description if the change calls for it.`
		});

	// Merging is the next step once nothing stands in its way.
	const checksPass = !pull.checks || pull.checks.state === 'success';
	if (actions.length === 0 && checksPass && !pull.draft)
		actions.push({
			id: 'merge-pull',
			label: 'Merge PR',
			icon: 'icon-[lucide--git-merge]'
		});

	return actions;
}

/** Where a workspace stands, in a few words, with a tone for how that should feel. */
export type WorkspaceStanding = {
	label: string;
	/** `ok`: nothing in the way. `danger`: something is wrong. `accent`: something to do. */
	tone: 'ok' | 'danger' | 'accent' | 'neutral';
	/** An Iconify class. */
	icon: string;
};

/**
 * The state the actions follow from, put into words: what the workspace's top bar says
 * next to the actions. `null` when there is nothing worth saying.
 */
export function standingOf({ changes, upstream }: State): WorkspaceStanding | null {
	if (!changes) return null;
	const uncommitted = changes.uncommitted > 0;
	const unpushed = changes.unpushed === null ? changes.files.length > 0 : changes.unpushed > 0;
	const pull = upstream?.pull;
	const todo = (label: string): WorkspaceStanding => ({
		label,
		tone: 'accent',
		icon: 'icon-[lucide--circle-dot]'
	});

	if (!upstream) return uncommitted ? todo('Uncommitted changes') : null;
	if (!pull || pull.state === 'unknown')
		return uncommitted || unpushed ? todo('Changes to publish') : null;

	if (pull.state === 'merged')
		return { label: 'Merged', tone: 'ok', icon: 'icon-[lucide--git-merge]' };
	if (pull.state === 'closed')
		return { label: 'Closed', tone: 'neutral', icon: 'icon-[lucide--circle-slash]' };
	if (pull.checks?.state === 'failure')
		return { label: 'Checks failing', tone: 'danger', icon: 'icon-[lucide--circle-x]' };
	if (pull.review === 'changes_requested')
		return {
			label: 'Changes requested',
			tone: 'danger',
			icon: 'icon-[lucide--message-square-warning]'
		};
	if (uncommitted || unpushed) return todo('Unpublished changes');
	if (pull.checks?.state === 'pending')
		return { label: 'Checks running', tone: 'neutral', icon: 'icon-[lucide--circle-dashed]' };
	if (pull.draft) return { label: 'Draft', tone: 'neutral', icon: 'icon-[lucide--pencil-line]' };
	return { label: 'Ready to merge', tone: 'ok', icon: 'icon-[lucide--circle-check]' };
}
