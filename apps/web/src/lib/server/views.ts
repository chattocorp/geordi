import { actionsFor, PUBLISHING, standingOf } from '#lib/actions.ts';
import { outcome } from '#lib/attention.ts';
import { withAides } from '#lib/family.ts';
import { hub, repos, standings, terminals, watchers, workspaces } from './app.ts';
import { UNTITLED } from './workspaces.ts';

/**
 * What pages show that is live, each as something to read now and again whenever it may
 * have changed: after every event, and when `also` says so. They reach browsers over the
 * one connection each window has (`live.ts`), by these names.
 */
export type View<T> = { read: () => T; also?: (changed: () => void) => () => void };

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
				const state = {
					...(standings().get(workspace.worktreeId) ?? { changes: null, upstream: null }),
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
export const workspace = (id: string) =>
	({
		read: () => {
			const workspace = workspaces().get(id);
			// the agents working in this workspace's directory are part of it: shown in it, as
			// conversations beside its own, and not among what it started
			const aides = workspaces()
				.sharing(id)
				.filter((other) => other.id !== id && workspace.worktreeId === id);
			return {
				...workspace,
				// who but the person may have written in its conversation: the agents above it
				senders: Object.fromEntries(
					workspaces()
						.ancestors(id)
						.map(({ id, title }) => [id, title])
				),
				// Whole, with their conversations: they are shown in this workspace, and come with it
				// in the one connection it has. (A browser has six to a server: one each would
				// soon leave none for anything else.) One that has not been told anything yet has
				// no name: it is a new conversation.
				aides: aides.map((aide) => ({
					...workspaces().get(aide.id),
					title: aide.title === UNTITLED ? 'New conversation' : aide.title
				})),
				git: watchers().state(workspace.worktreeId),
				terminals: terminals().running(id),
				// the jobs among them that are over: their terminals are still there to be read
				finished: terminals().finished(id)
			};
		},
		also: (changed) => {
			const unwatch = watchers().watch(workspaces().summary(id).worktreeId, changed);
			const unsubscribe = terminals().subscribe(changed);
			return () => {
				unwatch();
				unsubscribe();
			};
		}
	}) satisfies View<unknown>;

/** The views by the names browsers ask for them by. Each takes a key (an ID), or none. */
export const views = { navigation, workspace };

export type Navigation = ReturnType<ReturnType<typeof navigation>['read']>;
export type WorkspaceLive = ReturnType<ReturnType<typeof workspace>['read']>;
