import type { Changes, CheckCounts, Upstream } from '@geordi/protocol';

/**
 * What could or should happen next in a workspace (FDR-003), worked out from where its
 * changes and its pull request stand. Most actions are a message to the workspace's agent;
 * merging and archiving are things Geordi does itself.
 */
export type WorkspaceAction = {
	id:
		| 'merge-upstream'
		| 'commit'
		| 'create-pull'
		| 'update-pull'
		| 'resolve-conflicts'
		| 'fix-checks'
		| 'address-review'
		| 'enable-auto-merge'
		| 'cancel-auto-merge'
		| 'ready-for-review'
		| 'merge-pull'
		| 'restore-worktree'
		| 'retry'
		| 'continue'
		| 'archive';
	label: string;
	incomingCommits?: number;
	/** An Iconify class. */
	icon: string;
	/**
	 * What to say to the agent. Absent for actions Geordi carries out itself. Updating is
	 * both: Geordi's where git can do it alone, and this message where it can't.
	 */
	prompt?: string;
	/** The pull request shown when this action was offered. */
	pullNumber?: string;
	/** An alternative to the next step rather than the next step itself: offered beside it, quietly. */
	aside?: boolean;
};

type State = {
	/** `null` while unknown (no daemon, or not asked yet). */
	changes:
		| (Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> & {
				landed?: boolean;
				incoming?: Changes['incoming'];
		  })
		| null;
	/** `null` if the repository is not on a forge we know, or not asked yet. */
	upstream: Upstream | null;
	/** Whether the agent's latest turn failed (and was not just stopped). */
	failed?: boolean;
	/** Whether an agent started the workspace: its work goes back to that one. */
	child?: boolean;
};

/** Whether everything the workspace did is in the branch it started from, with no pull request to say so. */
const landedLocally = ({ changes, upstream }: State) =>
	!!changes?.landed &&
	changes.uncommitted === 0 &&
	(!upstream?.pull || upstream.pull.state === 'unknown');

/** A pushed branch with work on it, and no pull request for it. */
const awaitsPull = ({ changes, upstream }: State) =>
	!!changes &&
	!!upstream?.pushed &&
	(!upstream.pull || upstream.pull.state === 'unknown') &&
	changes.files.length > 0;

/** What to tell the agent to bring the latest of the branch its work is based on into it. */
const mergeFrom = (branch: string | null) =>
	`Merge the latest commits from ${branch ? `the base branch ${JSON.stringify(branch)}` : 'its base branch'} into this workspace's current branch. Fetch first if it is a remote-tracking branch. Preserve uncommitted work, resolve any merge conflicts keeping the intent of both sides, and run the relevant checks.`;

/**
 * The actions that make sense now, the most pressing first. The first one is what the UI
 * presents as *the* next step.
 */
export function actionsFor(state: State): WorkspaceAction[] {
	const actions = nextActions(state);
	const incoming = state.changes?.incoming;
	const pull = state.upstream?.pull;
	if (
		!incoming ||
		incoming.commits <= 0 ||
		state.failed ||
		landedLocally(state) ||
		pull?.state === 'merged' ||
		pull?.state === 'closed' ||
		// resolving them is updating already
		pull?.conflicts ||
		// offered as the next step already
		actions.some((action) => action.id === 'merge-upstream')
	)
		return actions;
	return [
		...actions,
		{
			id: 'merge-upstream',
			label: 'Sync',
			incomingCommits: incoming.commits,
			icon: 'icon-[lucide--git-merge]',
			aside: actions.length > 0,
			prompt: mergeFrom(incoming.branch)
		}
	];
}

function nextActions(state: State): WorkspaceAction[] {
	const { changes, upstream } = state;
	if (!changes) return [];
	// Before anything else: the agent did not get to the end of what it was doing.
	if (state.failed)
		return [
			{
				id: 'retry',
				label: 'Retry',
				icon: 'icon-[lucide--rotate-cw]',
				prompt:
					'Your last turn ended with an error before you were done. Carry on where you left off.'
			}
		];
	// Its work is where it was headed, without a pull request: done with.
	if (landedLocally(state))
		return [{ id: 'archive', label: 'Archive', icon: 'icon-[lucide--archive]' }];
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
		return local || awaitsPull(state)
			? [
					{
						id: 'create-pull',
						label: 'Create PR',
						icon: 'icon-[lucide--git-pull-request-create]',
						prompt:
							'Commit any uncommitted changes with clear commit messages, push this branch, and open a pull request for it. Give it a title and a description that explain the change and why.'
					}
				]
			: [];

	const archive: WorkspaceAction = {
		id: 'archive',
		label: 'Archive',
		icon: 'icon-[lucide--archive]'
	};
	// Its work has landed (or was given up): the workspace is done with, unless there is
	// more to do in it. Then it carries on, on a fresh branch.
	if (pull.state === 'merged' || pull.state === 'closed')
		return [
			{ id: 'continue', label: 'Continue', icon: 'icon-[lucide--git-branch-plus]', aside: true },
			archive
		];

	const number = `pull request #${pull.number}`;
	const actions: WorkspaceAction[] = [];
	if (pull.conflicts)
		actions.push({
			id: 'resolve-conflicts',
			label: 'Resolve conflicts',
			icon: 'icon-[lucide--git-merge-conflict]',
			// the base upstream (`origin`, as in `upstream.ts`): what the pull request merges into
			prompt: `Pull request #${pull.number} conflicts with its base branch. ${mergeFrom(pull.base && `origin/${pull.base}`)} Then push.`
		});
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

	if (pull.draft && upstream.forge === 'github')
		actions.push({
			id: 'ready-for-review',
			label: 'Ready for review',
			icon: 'icon-[lucide--git-pull-request]',
			pullNumber: pull.number
		});

	// The base branch's rules want it up to date: updating it is the next step.
	if (pull.blocked === 'behind' && actions.length === 0) {
		const incoming = changes.incoming;
		actions.push({
			id: 'merge-upstream',
			label: 'Sync',
			...(incoming && incoming.commits > 0 && { incomingCommits: incoming.commits }),
			icon: 'icon-[lucide--git-merge]',
			prompt: `${mergeFrom(pull.base && `origin/${pull.base}`)} Then push.`
		});
	}

	// Merging is the next step once nothing stands in its way.
	const checksPass = !pull.checks || pull.checks.state === 'success';
	// Auto-merge is for what can't be merged yet: checks still running, a review to wait for,
	// or anything else the base branch's rules still want.
	const waiting = !checksPass || pull.review === 'pending' || !!pull.blocked;
	if (pull.autoMerge?.enabled) {
		if (pull.autoMerge.canDisable)
			actions.push({
				id: 'cancel-auto-merge',
				label: 'Disable Auto-merge',
				icon: 'icon-[lucide--circle-x]',
				pullNumber: pull.number,
				aside: true
			});
	} else if (pull.autoMerge?.canEnable && waiting && !pull.draft && actions.length === 0) {
		actions.push({
			id: 'enable-auto-merge',
			label: 'Auto-merge',
			icon: 'icon-[lucide--git-merge]',
			pullNumber: pull.number
		});
	} else if (!pull.draft && actions.length === 0 && checksPass && !pull.blocked)
		actions.push({
			id: 'merge-pull',
			label: 'Merge PR',
			icon: 'icon-[lucide--git-merge]'
		});

	return actions;
}

/**
 * Actions that publish the work. Not offered while an agent is still at it: the work is not
 * done, and what would be committed or put into a pull request is whatever is there then.
 */
export const PUBLISHING: WorkspaceAction['id'][] = ['commit', 'create-pull', 'update-pull'];

/** Where a workspace stands, in a few words, with a tone for how that should feel. */
export type WorkspaceStanding = {
	label: string;
	/**
	 * `ok`: nothing in the way. `danger`: something is wrong. `accent`: something to do.
	 * `merged`: done and landed.
	 */
	tone: 'ok' | 'danger' | 'accent' | 'merged' | 'neutral';
	/** An Iconify class. */
	icon: string;
	/** While checks run: how many of them stand how, where the forge says. */
	checks?: CheckCounts;
};

/**
 * The state the actions follow from, put into words: what the workspace's top bar says
 * next to the actions. `null` when there is nothing worth saying.
 */
export function standingOf(state: State): WorkspaceStanding | null {
	const { changes, upstream } = state;
	if (!changes) return null;
	if (state.failed)
		return { label: 'Turn failed', tone: 'danger', icon: 'icon-[lucide--triangle-alert]' };
	if (landedLocally(state))
		return {
			label: state.child ? 'Merged into parent' : 'Merged',
			tone: 'merged',
			icon: 'icon-[lucide--git-merge]'
		};
	const uncommitted = changes.uncommitted > 0;
	const unpushed = changes.unpushed === null ? changes.files.length > 0 : changes.unpushed > 0;
	const pull = upstream?.pull;
	const todo = (label: string): WorkspaceStanding => ({
		label,
		tone: 'accent',
		icon: 'icon-[lucide--circle-dot]'
	});

	if (!pull || pull.state === 'unknown') {
		if (uncommitted) return todo('Uncommitted changes');
		if (upstream && unpushed) return todo('Changes to publish');
		if (awaitsPull(state)) return todo('Branch pushed');
		if (changes.incoming && changes.incoming.commits > 0) return todo('Behind base branch');
		return null;
	}

	if (pull.state === 'merged')
		return { label: 'Merged', tone: 'merged', icon: 'icon-[lucide--git-merge]' };
	if (pull.state === 'closed')
		return { label: 'Closed', tone: 'neutral', icon: 'icon-[lucide--circle-slash]' };
	if (pull.conflicts)
		return { label: 'Conflicts', tone: 'danger', icon: 'icon-[lucide--git-merge-conflict]' };
	if (pull.checks?.state === 'failure')
		return { label: 'Checks failing', tone: 'danger', icon: 'icon-[lucide--circle-x]' };
	if (pull.review === 'changes_requested')
		return {
			label: 'Changes requested',
			tone: 'danger',
			icon: 'icon-[lucide--message-square-warning]'
		};
	if (uncommitted) return todo('Uncommitted changes');
	if (unpushed) return todo('Unpublished changes');
	if (pull.checks?.state === 'pending')
		return {
			label: 'Checks running',
			tone: 'neutral',
			icon: 'icon-[lucide--circle-dashed] animate-checks-spin',
			checks: pull.checks.counts
		};
	if (pull.autoMerge?.enabled)
		return {
			label: 'Auto-merge enabled',
			tone: 'neutral',
			icon: 'icon-[lucide--git-merge]',
			checks: pull.checks?.counts
		};
	if (pull.draft) return { label: 'Draft', tone: 'neutral', icon: 'icon-[lucide--pencil-line]' };
	if (pull.review === 'pending' && (pull.autoMerge?.canEnable || pull.blocked === 'rules'))
		return { label: 'Awaiting review', tone: 'neutral', icon: 'icon-[lucide--clock]' };
	if (pull.blocked === 'behind') return todo('Behind base branch');
	if (pull.blocked === 'rules')
		return { label: 'Merge blocked', tone: 'danger', icon: 'icon-[lucide--shield-alert]' };
	return { label: 'Ready to merge', tone: 'ok', icon: 'icon-[lucide--circle-check]' };
}
