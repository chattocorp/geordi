import { inWorktree } from './worktree-queue.ts';
import { sameAgentSettings, type ForgeMessage, type AgentEvent } from '@geordi/protocol';
import {
	ensureWorktree,
	fetchUpstream,
	hasWorktree,
	verifyLinks,
	worktreePath
} from './worktree.ts';
import { projectPath, ensureProject } from './projects.ts';
import type { Meta } from './host.ts';
import type { Session, Said } from './session.ts';

type Message = Extract<ForgeMessage, { type: 'agent.message' }>;
type WorktreeMessage = Exclude<Message, { project: true }>;
type Worktree = Awaited<ReturnType<typeof ensureWorktree>>;

export function turnStarts({
	worktreesDir,
	projectsDir,
	sessions,
	setups,
	apiUrl,
	prepared,
	configFor,
	begin,
	emitFor
}: {
	worktreesDir: string;
	/** Where projects' folders are (FDR-012). */
	projectsDir: string;
	sessions: ReadonlyMap<string, Session>;
	setups: Map<string, Promise<string | null>>;
	apiUrl: string;
	prepared(worktree: Worktree, message: WorktreeMessage): void;
	configFor(worktree: Worktree, message: WorktreeMessage): Promise<{ env: Record<string, string> }>;
	begin(id: string, meta: Meta, heard: Said[]): void;
	emitFor(id: string): (event: AgentEvent) => void;
}) {
	const beginning = new Map<string, { cwd: string; heard: Said[]; stop(): void }>();
	async function startMessage(message: Message) {
		const { workspaceId, worktreeId, agent, settings } = message;
		const emit = emitFor(workspaceId);
		const said: Said = {
			prompt: message.prompt,
			deliveryId: message.deliveryId,
			...(message.images && { images: message.images })
		};

		// one that is about to start hears it when it does
		const sooner = beginning.get(workspaceId);
		if (sooner) {
			sooner.heard.push(said);
			return;
		}
		const heard = [said];
		const stopped = Promise.withResolvers<never>();
		const cwd =
			'project' in message
				? projectPath(projectsDir, worktreeId)
				: worktreePath(worktreesDir, message);
		let canceled = false;
		function checkStop() {
			if (canceled) throw new Error('Stopped');
		}
		beginning.set(workspaceId, {
			cwd,
			heard,
			stop: () => {
				canceled = true;
				stopped.reject(new Error('Stopped'));
			}
		});
		try {
			const prepare = inWorktree(cwd, async () => {
				checkStop();
				let session = sessions.get(workspaceId);
				// A CLI runs as it was started. Told to run otherwise (with another model, say), it
				// is started anew, unless it is in the middle of something: then that waits.
				if (
					session &&
					!session.over() &&
					!session.working() &&
					!sameAgentSettings(session.options.settings, settings)
				) {
					session.close();
					await Promise.race([
						stopped.promise,
						session.done,
						new Promise((resolve) => setTimeout(resolve, 15_000))
					]);
					checkStop();
					session = sessions.get(workspaceId);
					if (session && !session.over())
						throw new Error(
							'Previous session is still closing. Retry the message to apply the new settings.'
						);
				}
				// An agent whose CLI is running is simply told: between turns that starts one,
				// during a turn it steers.
				if (session && !session.over()) {
					heard.forEach(session.say);
					return null;
				}

				// A project works in a folder of its own, which is all there is to make for it.
				if ('project' in message)
					return { path: ensureProject(projectsDir, worktreeId), project: true as const };

				// A workspace of its own starts from where its upstream stands now. (One started
				// by an agent starts from that agent's branch, which is here already.)
				const { repoPath, base } = message;
				if (!base && !hasWorktree(worktreesDir, message)) {
					const problem = await Promise.race([stopped.promise, fetchUpstream(repoPath)]);
					if (problem) console.warn(`could not fetch ${repoPath}: ${problem}`);
				}
				checkStop();
				const worktree = await ensureWorktree(worktreesDir, message);
				// Restored too: a first attempt that was cut short (the daemon stopped during the
				// checkout, say) leaves the branch behind, so the worktree is new to the forge.
				if (worktree.created || worktree.restored) {
					emit({ kind: 'worktree', path: worktree.path, branch: worktree.branch });
					prepared(worktree, message);
				}

				return worktree;
			});
			const worktree = await Promise.race([stopped.promise, prepare]);
			if (!worktree) return;
			const project = 'project' in worktree;

			// The agent starts once the directory is set up, and hears how that went. Stopped
			// meanwhile, the turn ends; the setup goes on, for the next one to wait for.
			const setup = setups.get(worktreeId);
			if (setup) {
				const note = await Promise.race([stopped.promise, setup]);
				if (setups.get(worktreeId) === setup) setups.delete(worktreeId);
				if (note) heard[0] = { ...said, prompt: `${note}\n\n${said.prompt}` };
			}

			const launch = inWorktree(cwd, async () => {
				checkStop();
				const options = {
					sessionId: workspaceId,
					dir: '', // `begin` knows where
					resumeId: message.resumeId,
					settings,
					// a project has no repository, and so no ports or jobs of one
					env:
						'project' in worktree || 'project' in message
							? {}
							: (await configFor(worktree, message)).env,
					instructions: message.instructions,
					cwd: worktree.path,
					...(!project && { worktree }),
					writableRoots: project ? [] : worktree.writableRoots,
					api: { url: apiUrl }
				};
				checkStop();
				if (!project) verifyLinks(worktree);
				begin(workspaceId, { agent, options, apiToken: message.apiToken }, heard);
			});
			await Promise.race([stopped.promise, launch]);
		} catch (error) {
			emit({ kind: 'turn.failed', error: error instanceof Error ? error.message : String(error) });
		} finally {
			beginning.delete(workspaceId);
		}
	}
	return { beginning, startMessage };
}
