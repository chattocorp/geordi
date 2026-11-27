import { actionsFor, PUBLISHING, standingOf } from '@geordi/ui/actions';
import { outcome } from '#lib/attention.ts';
import { isInactive, withAides } from '#lib/family.ts';
import { hub, jobs, limits, repos, standings, terminals, watchers, workspaces } from './app.ts';
import type { GeordiEvent } from './events/index.ts';
import { UNTITLED, type TranscriptFollower, type Workspace } from './workspaces.ts';

/**
 * What pages show that is live, each as something to read now and again whenever it may
 * have changed: after a relevant event, and when `also` says so. They reach browsers over the
 * one connection each window has (`live.ts`), by these names.
 */
export type View<T> = {
	read: () => T;
	incremental?: boolean;
	affects?: (event: GeordiEvent) => boolean;
	also?: (changed: () => void) => () => void;
};

/**
 * Everything that every page needs. What the sidebar shows: repositories, and the
 * workspaces that stand for themselves (newest first). An agent working in another
 * workspace's directory is part of that one: it makes it `working`, and what it started
 * counts as started there. `outcome` is how all of their work came to rest, `null` while
 * any of it goes on (FDR-008).
 */
export const navigation = () =>
	({
		read: () => {
			const all = workspaces().all();
			const harnesses = hub().harnesses();
			const ownerOf = new Map(all.map((workspace) => [workspace.id, workspace.worktreeId]));
			const byId = new Map(all.map((workspace) => [workspace.id, workspace]));
			const operations = new Map(
				Array.from(hub().operations(), ({ worktreeId, action }) => [worktreeId, action])
			);
			const listed = withAides(all).map(({ workspace, aides }) => {
				const { id, title, repoId, parentId, status, worktree } = workspace;
				const busy = [workspace, ...aides].filter((w) => w.status === 'running');
				const working = busy.length > 0;
				const waiting = working && !harnesses && busy.every((w) => w.pendingDelivery);
				// how its work stands, as far as is known: asked about in the background
				const known = standings().get(workspace.worktreeId) ?? { changes: null, upstream: null };
				const activeAction =
					operations.get(workspace.worktreeId) ??
					busy.find(
						(member) =>
							!member.asking && !(member.pendingDelivery && !harnesses) && member.activeAction
					)?.activeAction;
				const state = {
					...known,
					failed: workspace.lastTurn === 'failed',
					child: !!parentId,
					locked: workspace.locked
				};
				return {
					id,
					title,
					repoId,
					// one whose parent is gone (an archived project's, FDR-012) stands for itself
					parentId: (parentId && ownerOf.get(parentId)) ?? null,
					status,
					working,
					...(activeAction && { activeAction }),
					...(waiting && { waiting: true }),
					outcome: outcome([workspace, ...aides]),
					standing: standingOf(state),
					// what could happen next (FDR-003): offered in its context menu
					actions: actionsFor(state).filter(
						(action) => !working || !PUBLISHING.includes(action.id)
					),
					branch: worktree?.branch ?? null,
					// so that agent output that names it can link to this workspace (`workspace-links.ts`)
					pull: known.upstream?.pull
						? { number: known.upstream.pull.number, url: known.upstream.pull.url }
						: null,
					// put aside for later, by itself or with what started it
					...(isInactive(byId, id) && { inactive: true }),
					// kept from archiving until a person unlocks it (FDR-015)
					...(workspace.locked && { locked: true }),
					// when anything last happened in it, also in the agents working alongside
					updatedAt: [workspace, ...aides]
						.map((member) => member.updatedAt)
						.reduce((a, b) => (a > b ? a : b))
				};
			});
			return {
				repos: repos()
					.list()
					.map((repo) => {
						const own = listed.filter((workspace) => workspace.repoId === repo.id);
						return {
							...repo,
							workspaceCount: own.length,
							working: own.filter((workspace) => workspace.working).length
						};
					}),
				workspaces: listed,
				access: workspaces().access.list(),
				preferences: workspaces().preferences.get(),
				/**
				 * What each agent can be asked to run: its models and their effort levels, as the
				 * connected daemon reports them. `null` while no daemon is connected.
				 */
				activeAgents: all.filter((w) => w.status === 'running').map((w) => w.agent),
				harnesses
			};
		},
		also: (changed) => {
			const stops = [
				standings().subscribe(changed),
				hub().subscribe(changed),
				hub().followOperations(changed)
			];
			return () => stops.forEach((stop) => stop());
		}
	}) satisfies View<unknown>;

/**
 * One workspace with its conversation.
 *
 * While someone has this open, a daemon watches the workspace's files, and `git` is how
 * its changes and its pull request stand: loaded here once for everyone looking, and again
 * whenever something changes. `null` until first loaded.
 * `terminals` names the workspace's terminals whose shells are running.
 */
export const workspace = (id: string) => {
	const transcripts = new Map<string, TranscriptFollower>();
	const readTranscript = (id: string) => {
		let follower = transcripts.get(id);
		if (!follower) {
			follower = workspaces().followTranscript(id);
			transcripts.set(id, follower);
		}
		return follower.read();
	};
	let owner = id;
	let notify: (() => void) | undefined;
	let unwatch: (() => void) | undefined;
	let ancestors = new Set<string>();
	return {
		incremental: true,
		affects(event) {
			if (event.type === 'workspace.restored' && workspaces().worktreeOf(event.data.id) === id)
				return true;
			if (event.type === 'workspace.created' && event.data.worktreeId === id) return true;
			if (event.type === 'workspace.purged')
				return (
					event.data.workspaces.some((gone) => gone.id === id || transcripts.has(gone.id)) ||
					event.data.worktrees.some((worktree) => worktree.id === owner)
				);
			if (!event.stream.startsWith('workspace:') || !('id' in event.data)) return false;
			const source = event.data.id;
			if (source === id || transcripts.has(source)) return true;
			if (
				event.type === 'workspace.questionForwarded' ||
				event.type === 'workspace.answered' ||
				event.type === 'workspace.archived' ||
				event.type === 'workspace.titled' ||
				(event.type === 'workspace.output' &&
					['turn.completed', 'turn.failed', 'question.closed'].includes(event.data.event.kind))
			) {
				const parent = workspaces().parentOf(source);
				if (parent && (parent === id || transcripts.has(parent))) return true;
			}
			if (event.type === 'workspace.titled' && ancestors.has(source)) return true;
			if (
				source === owner &&
				(event.type === 'workspace.continued' ||
					event.type === 'workspace.switched' ||
					event.type === 'workspace.based')
			)
				return true;
			return (
				event.type === 'workspace.output' &&
				event.data.event.kind === 'worktree' &&
				workspaces().worktreeOf(source) === owner
			);
		},
		read: () => {
			const workspace = workspaces().summary(id);
			owner = workspace.worktreeId;
			// Archived conversations can outlive the local repository. Start following Git
			// only once the conversation is active and has a worktree to show again.
			// A project has no worktree to watch at all (FDR-012).
			if (workspace.archivedAt || workspace.repoId === null) {
				unwatch?.();
				unwatch = undefined;
			} else if (notify) {
				unwatch ??= watchers().watch(owner, notify);
			}
			const parents = workspaces().ancestors(id);
			ancestors = new Set(parents.map((parent) => parent.id));
			// the agents working in this workspace's directory are part of it: shown in it, as
			// conversations beside its own, and not among what it started
			const aides = workspaces()
				.sharing(id)
				.filter((other) => other.id !== id && workspace.worktreeId === id);
			for (const [other, follower] of transcripts) {
				if (other !== id && !aides.some((aide) => aide.id === other)) {
					follower.close();
					transcripts.delete(other);
				}
			}
			return {
				...workspace,
				forwardedQuestions: workspaces().forwardedQuestions(id),
				background: hub().background(id),
				sessionModel: hub().sessionModel(id),
				transcript: readTranscript(id),
				// who but the person may have written in its conversation: the agents above it
				senders: Object.fromEntries(parents.map(({ id, title }) => [id, title])),
				// Each aide has its own snapshot and subsequent edits.
				aides: aides.map((aide) => ({
					...aide,
					forwardedQuestions: workspaces().forwardedQuestions(aide.id),
					background: hub().background(aide.id),
					sessionModel: hub().sessionModel(aide.id),
					transcript: readTranscript(aide.id),
					title: aide.title === UNTITLED ? 'New conversation' : aide.title
				})),
				// a project has no worktree to watch (FDR-012)
				git: workspace.repoId === null ? null : watchers().state(workspace.worktreeId),
				startingJobs: jobs().starting(id),
				terminals: terminals().running(id),
				// the jobs among them that are over: their terminals are still there to be read
				finished: terminals().finished(id)
			};
		},
		also: (changed) => {
			const relevant = (source: string) => {
				if (source === id || transcripts.has(source)) changed();
			};
			const stopSession = hub().followSession(relevant);
			const stopUsage = workspaces().followUsage(relevant);
			notify = changed;
			const stopJobs = jobs().subscribe((source) => {
				if (source === id) changed();
			});
			const unsubscribe = terminals().subscribe(changed);
			return () => {
				for (const follower of transcripts.values()) follower.close();
				transcripts.clear();
				stopSession();
				stopUsage();
				notify = undefined;
				unwatch?.();
				unwatch = undefined;
				stopJobs();
				unsubscribe();
			};
		}
	} satisfies View<unknown>;
};

/**
 * The commands a workspace's agent offers (its slash commands and skills), for its reply box.
 * A view of its own, apart from the workspace's: some hundred of them, which change seldom,
 * and are sent only when they do. `null` until the agent has said.
 */
export const commands = (id: string) =>
	({
		read: () => hub().commands(id),
		also: (changed) => hub().followCommands((source) => source === id && changed())
	}) satisfies View<unknown>;

const archive = () => ({
	read: () => {
		const names = new Map(
			repos()
				.list()
				.map((repo) => [repo.id, repo.name])
		);
		return workspaces()
			.archived()
			.map((entry) => ({
				...entry,
				repository: entry.repoId === null ? 'Project' : (names.get(entry.repoId) ?? entry.repoId)
			}));
	},
	affects: (event: GeordiEvent) =>
		[
			'workspace.archived',
			'workspace.restored',
			'workspace.purged',
			'workspace.titled',
			'repo.registered',
			'repo.removed'
		].includes(event.type)
});
export type ArchiveEntry = ReturnType<ReturnType<typeof archive>['read']>[number];

/** The usage limits of the agents' subscriptions, for the context meter and the model picker (`limits.ts`). */
export const usageLimits = () =>
	({
		read: () => limits().read(),
		also: (changed) => limits().subscribe(changed)
	}) satisfies View<unknown>;

/** The views by the names browsers ask for them by. Each takes a key (an ID), or none. */
export const views = {
	navigation,
	workspace,
	commands,
	archive,
	limits: usageLimits
};

export type Navigation = ReturnType<ReturnType<typeof navigation>['read']>;
export type WorkspaceUpdate = ReturnType<ReturnType<typeof workspace>['read']>;
export type WorkspaceLive = Omit<WorkspaceUpdate, 'transcript' | 'aides'> &
	Workspace & {
		aides: (Workspace &
			Pick<
				WorkspaceUpdate,
				'background' | 'suggestion' | 'sessionModel' | 'pendingDelivery' | 'forwardedQuestions'
			>)[];
	};
