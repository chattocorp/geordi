import type { Agent, AgentEvent } from '@geordi/protocol';
import type { WorkspacesEvent } from './workspaces.ts';

/**
 * Events as they were written before a workspace had exactly one conversation: sessions
 * were things of their own, first one per worktree, then several inside a workspace.
 */
export type LegacyEvent =
	| {
			type: 'session.created';
			stream: `session:${string}`;
			data: {
				id: string;
				agent: Agent;
				title: string;
				/** Present on the very first sessions, which had no workspace. */
				repoId?: string;
				workspaceId?: string;
				parentSessionId?: string;
			};
	  }
	| { type: 'session.message'; stream: `session:${string}`; data: { id: string; text: string } }
	| {
			type: 'session.output';
			stream: `session:${string}`;
			data: { id: string; event: AgentEvent };
	  };

/**
 * For a while, the instructions of a skill an agent read were recorded as if the agent had
 * said them. They are told apart by how Claude Code introduces them.
 */
function isSkillText(event: { data: unknown }): boolean {
	const output = (event.data as { event?: AgentEvent }).event;
	return output?.kind === 'text' && output.text.startsWith('Base directory for this skill: ');
}

type Created = Extract<WorkspacesEvent, { type: 'workspace.created' }>['data'];
/** A workspace as it used to be created: without an agent, which came with its first session. */
type LegacyCreated = Omit<Created, 'agent'> & {
	agent?: Agent;
	parentSessionId?: string;
	/** A repository's own workspace, in its checkout: there are none any more. */
	home?: true;
};

type Current<E> = E extends { type: infer T; data: infer D } ? { type: T; data: D } : never;
/** What the projection understands: today's events, without the envelope. */
export type CurrentEvent = Current<WorkspacesEvent>;

/**
 * Translates old events into today's, so the projection only has to know one shape. Feed it
 * every workspace and session event in order; it returns what each amounts to now.
 *
 * - A session of old becomes the conversation of its workspace: the first session of a
 *   workspace *is* that workspace, any further one a workspace of its own that shares the
 *   first one's worktree.
 * - For a while, each repository had a workspace of its own that worked in its checkout
 *   ("Home"). They are gone, with the agents that worked alongside them; what they started
 *   in worktrees of their own stays, without a parent.
 */
export function createUpcaster() {
	/** Which workspace an old session's messages and output belong to now. */
	const workspaceOf = new Map<string, string>();
	/** Old workspaces still waiting for their first session, to learn their agent. */
	const waiting = new Map<string, LegacyCreated>();
	/** What later sessions of an old workspace need to know about it. */
	const known = new Map<string, { repoId: string; base?: string }>();
	/**
	 * Workspaces that are no more: Home workspaces, and the agents in their checkout. Their
	 * other events need no filtering: the projection ignores events of unknown workspaces.
	 */
	const gone = new Set<string>();

	const created = (data: Created): CurrentEvent[] => {
		known.set(data.id, { repoId: data.repoId, base: data.base });
		return [{ type: 'workspace.created', data }];
	};
	const parentOf = (sessionId?: string) => (sessionId ? workspaceOf.get(sessionId) : undefined);

	return (event: { type: string; data: unknown }): CurrentEvent[] => {
		switch (event.type) {
			case 'workspace.created': {
				const { home, ...data } = event.data as LegacyCreated;
				if (home || (data.worktreeId && gone.has(data.worktreeId))) {
					gone.add(data.id);
					return [];
				}
				if (data.parentId && gone.has(data.parentId)) delete data.parentId;
				if (data.agent) return created(data as Created);
				waiting.set(data.id, data);
				return [];
			}

			case 'session.created': {
				const { id, agent, title, repoId, workspaceId, parentSessionId } = (
					event as Extract<LegacyEvent, { type: 'session.created' }>
				).data;

				// before workspaces: the session is the workspace
				if (repoId) {
					workspaceOf.set(id, id);
					return created({ id, repoId, title, agent });
				}

				// the first session of a workspace gives it its agent
				const pending = workspaceId && waiting.get(workspaceId);
				if (pending) {
					waiting.delete(pending.id);
					workspaceOf.set(id, pending.id);
					const { parentSessionId: startedBy, ...workspace } = pending;
					return created({ ...workspace, agent, parentId: parentOf(startedBy) });
				}

				// any further session works in that workspace's worktree
				const host = workspaceId && known.get(workspaceId);
				if (!host || !workspaceId) return [];
				workspaceOf.set(id, id);
				return created({
					id,
					repoId: host.repoId,
					title,
					agent,
					parentId: parentOf(parentSessionId),
					worktreeId: workspaceId,
					base: host.base
				});
			}

			case 'session.message':
			case 'session.output': {
				if (isSkillText(event)) return [];
				const { id, ...rest } = (event as Extract<LegacyEvent, { data: { id: string } }>).data;
				const workspaceId = workspaceOf.get(id);
				if (!workspaceId) return [];
				const type = event.type === 'session.message' ? 'workspace.message' : 'workspace.output';
				return [{ type, data: { id: workspaceId, ...rest } } as CurrentEvent];
			}

			case 'workspace.output':
				return isSkillText(event) ? [] : [event as CurrentEvent];

			case 'workspace.message':
			case 'workspace.queued':
			case 'workspace.dequeued':
			case 'workspace.titled':
			case 'workspace.configured':
			case 'workspace.continued':
			case 'workspace.switched':
			case 'workspace.steered':
			case 'workspace.answered':
			case 'workspace.archived':
			case 'workspace.hidden':
				return [event as CurrentEvent];

			default:
				return [];
		}
	};
}
