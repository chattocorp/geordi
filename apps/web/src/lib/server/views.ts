import { actionsFor, PUBLISHING, standingOf } from '#lib/actions.ts';
import { outcome } from '#lib/attention.ts';
import { withAides } from '#lib/family.ts';
import { hub, repos, standings, terminals, watchers, workspaces } from './app.ts';
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
			const ownerOf = new Map(all.map((workspace) => [workspace.id, workspace.worktreeId]));
			const listed = withAides(all).map(({ workspace, aides }) => {
				const { id, title, repoId, parentId, status, worktree } = workspace;
				const working = status === 'running' || aides.some((aide) => aide.status === 'running');
				// how its work stands, as far as is known: asked about in the background
				const known = standings().get(workspace.worktreeId) ?? { changes: null, upstream: null };
				const pull = known.upstream?.pull;
				const state = {
					...known,
					failed: workspace.lastTurn === 'failed',
					child: !!parentId
				};
				return {
					id,
					title,
					repoId,
					parentId: (parentId && ownerOf.get(parentId)) ?? parentId,
					status,
					working,
					outcome: outcome([workspace, ...aides]),
					standing: standingOf(state),
					// what could happen next (FDR-003): offered in its context menu
					actions: actionsFor(state).filter(
						(action) => !working || !PUBLISHING.includes(action.id)
					),
					branch: worktree?.branch ?? null,
					pull: pull && pull.state !== 'unknown' ? { number: pull.number, url: pull.url } : null,
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
				/**
				 * What each agent can be asked to run: its models and their effort levels, as the
				 * connected daemon reports them. `null` while no daemon is connected.
				 */
				harnesses: hub().harnesses()
			};
		},
		also: (changed) => {
			const stops = [standings().subscribe(changed), hub().subscribe(changed)];
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
	let ancestors = new Set<string>();
	return {
		incremental: true,
		affects(event) {
			if (event.type === 'workspace.created' && event.data.worktreeId === id) return true;
			if (!event.stream.startsWith('workspace:')) return false;
			const source = event.data.id;
			if (source === id || transcripts.has(source)) return true;
			if (event.type === 'workspace.titled' && ancestors.has(source)) return true;
			if (
				source === owner &&
				(event.type === 'workspace.continued' || event.type === 'workspace.switched')
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
				background: hub().background(id),
				transcript: readTranscript(id),
				// who but the person may have written in its conversation: the agents above it
				senders: Object.fromEntries(parents.map(({ id, title }) => [id, title])),
				// Each aide has its own snapshot and subsequent edits.
				aides: aides.map((aide) => ({
					...aide,
					background: hub().background(aide.id),
					transcript: readTranscript(aide.id),
					title: aide.title === UNTITLED ? 'New conversation' : aide.title
				})),
				git: watchers().state(workspace.worktreeId),
				terminals: terminals().running(id),
				// the jobs among them that are over: their terminals are still there to be read
				finished: terminals().finished(id)
			};
		},
		also: (changed) => {
			const stopTasks = hub().followBackground((source) => {
				if (source === id || transcripts.has(source)) changed();
			});
			const unwatch = watchers().watch(workspaces().summary(id).worktreeId, changed);
			const unsubscribe = terminals().subscribe(changed);
			return () => {
				for (const follower of transcripts.values()) follower.close();
				transcripts.clear();
				stopTasks();
				unwatch();
				unsubscribe();
			};
		}
	} satisfies View<unknown>;
};

/** The views by the names browsers ask for them by. Each takes a key (an ID), or none. */
export const views = { navigation, workspace };

export type Navigation = ReturnType<ReturnType<typeof navigation>['read']>;
export type WorkspaceUpdate = ReturnType<ReturnType<typeof workspace>['read']>;
export type WorkspaceLive = Omit<WorkspaceUpdate, 'transcript' | 'aides'> &
	Workspace & { aides: (Workspace & Pick<WorkspaceUpdate, 'background'>)[] };
