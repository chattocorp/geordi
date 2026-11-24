import type { WorkspaceAction } from '@geordi/ui/actions';
import { lineOf } from '#lib/family.ts';
import { promptTitle } from '#lib/prompt-title.ts';
import { isExternal } from './agent-access.ts';
import type {
	Agent,
	AgentEvent,
	AgentPlan,
	Compaction,
	AgentSettings,
	ContextUsage,
	SubagentState,
	SubagentUpdate,
	Question,
	ToolDiff,
	ToolInfo,
	TurnUsage,
	TurnDiff
} from '@geordi/protocol';
import type { TurnEnd } from '../attention.ts';
import type { EventStore, GeordiEvent } from './events/index.ts';
import { createUpcaster, type CurrentEvent } from './legacy.ts';

/*
 * The workspaces as the event log has them (ADR-001): their events, their state, and the
 * reducer that makes one of the other. What is done with workspaces is in `workspaces.ts`.
 */

export type ActionId = WorkspaceAction['id'];
type WorkspaceStream = `workspace:${string}`;

export type WorkspacesEvent =
	| {
			type: 'workspace.created';
			stream: WorkspaceStream;
			data: {
				id: string;
				/** Absent for a project, which belongs to no repository (FDR-012). */
				repoId?: string;
				/** Parent directory for this worktree. Older workspaces use the checkout's basename. */
				worktreeParent?: string;
				title: string;
				agent: Agent;
				/** The agent settings chosen when the workspace was created. */
				settings?: AgentSettings;
				/** The workspace whose agent started this one (FDR-002). */
				parentId?: string;
				/** The workspace whose worktree this one works in, if not its own. */
				worktreeId?: string;
				/** The branch its worktree starts from, if not the repository's checked-out one. */
				base?: string;
			};
	  }
	/**
	 * Something the user (or another agent) said to the workspace's agent: it starts a turn,
	 * or steers the one under way (ADR-010).
	 * `queued` marks a message that had been waiting: it is the first one in the queue.
	 * `steered` (from before ADR-010) marks one that had interrupted the agent.
	 */
	| {
			type: 'workspace.message';
			stream: WorkspaceStream;
			data: {
				action?: ActionId;
				id: string;
				text: string;
				images?: string[];
				senderName?: string;
				queued?: boolean;
				deliveryId?: string;
				steered?: boolean;
			};
	  }
	/**
	 * From before ADR-010, when steering meant stopping the agent's turn: a message that was
	 * to go out as soon as it had. No longer written; one that steers is a `workspace.message`.
	 */
	| {
			type: 'workspace.steered';
			stream: WorkspaceStream;
			data: { id: string; text: string; images?: string[] };
	  }
	| {
			type: 'workspace.undeliverable';
			stream: WorkspaceStream;
			data: { id: string; deliveryId: string; reason: string };
	  }
	/** A message to send once the agent has finished what it is doing. */
	| {
			type: 'workspace.queued';
			stream: WorkspaceStream;
			data: { id: string; text: string; action?: ActionId; images?: string[] };
	  }
	/** The workspace got a better name than the first line of its first message. */
	| { type: 'workspace.titled'; stream: WorkspaceStream; data: { id: string; title: string } }
	/** The complete agent settings for subsequent turns. */
	| {
			type: 'workspace.configured';
			stream: WorkspaceStream;
			data: { id: string; settings: AgentSettings };
	  }
	/**
	 * The workspace carries on with new work: its worktree moved to a new branch, off where
	 * work in the repository starts. Its conversation goes on.
	 */
	| { type: 'workspace.continued'; stream: WorkspaceStream; data: { id: string; branch: string } }
	/**
	 * The workspace's worktree turned out to be on another branch than was known: its agent
	 * renamed it, or switched to another. It is what the worktree comes back from.
	 */
	| { type: 'workspace.switched'; stream: WorkspaceStream; data: { id: string; branch: string } }
	/**
	 * The worktree's work is to be measured against another branch from now on (FDR-001):
	 * `base`, or where work in the repository starts where that is absent. Its branch stays
	 * where it is. On the stream of the workspace whose worktree it is.
	 */
	| { type: 'workspace.based'; stream: WorkspaceStream; data: { id: string; base?: string } }
	/**
	 * A person moved the workspace in the sidebar: right above `before`, or to the end of
	 * the list where that is `null`. Workspaces are otherwise listed newest first.
	 */
	| {
			type: 'workspace.moved';
			stream: WorkspaceStream;
			data: { id: string; before: string | null };
	  }
	/** The workspace is done with: out of the lists, its worktree gone, its history kept. */
	| { type: 'workspace.archived'; stream: WorkspaceStream; data: { id: string } }
	/** A person marked the workspace inactive (put it aside for later), or active again; saying something to it does that too. */
	| { type: 'workspace.deactivated'; stream: WorkspaceStream; data: { id: string } }
	| { type: 'workspace.activated'; stream: WorkspaceStream; data: { id: string } }
	/** A person locked the workspace: it can't be archived until they unlock it (FDR-015). */
	| { type: 'workspace.locked'; stream: WorkspaceStream; data: { id: string } }
	| { type: 'workspace.unlocked'; stream: WorkspaceStream; data: { id: string } }
	| { type: 'workspace.restored'; stream: WorkspaceStream; data: { id: string } }
	/** What a person answered to a question the agent asked: one answer per question, in their order. */
	| {
			type: 'workspace.answered';
			stream: WorkspaceStream;
			/** Historical answers have no pending flag and were final when recorded. */
			data: { id: string; question: string; answers: string[]; pending?: true };
	  }
	/**
	 * How full the agent's context was at the end of a turn (or when it said so between
	 * turns). What it says during a turn is only kept in memory: it says it after every step.
	 */
	| { type: 'workspace.usage'; stream: WorkspaceStream; data: { id: string; usage: ContextUsage } }
	/**
	 * What the agent suggests the person say next, now that its turn is over (`null`: it took
	 * it back). Its next turn withdraws it, too.
	 */
	| {
			type: 'workspace.suggested';
			stream: WorkspaceStream;
			data: { id: string; text: string | null };
	  }
	/** A waiting message was taken back; `index` is its place in the queue at the time. */
	| { type: 'workspace.dequeued'; stream: WorkspaceStream; data: { id: string; index: number } }
	/** Whatever the daemon reports, stored verbatim. */
	| {
			type: 'workspace.output';
			stream: WorkspaceStream;
			data: { id: string; event: AgentEvent; cursor?: string };
	  }
	/**
	 * Archived workspaces were deleted from the log for good, their streams with them
	 * (ADR-012). Says what they still mean to the workspaces that stay: that they were
	 * workspaces, from `born` (the `seq` they were created at) on, so what their agents said
	 * elsewhere stays theirs; and the worktree of a workspace that stays, where one of them
	 * worked alongside it and was what said where its worktree is. All in one stream, read
	 * before the replay.
	 */
	| {
			type: 'workspace.purged';
			stream: 'purges';
			data: {
				workspaces: { id: string; title: string; born: number; parentId?: string }[];
				worktrees: { id: string; path: string; branch: string }[];
			};
	  };

export type SubagentItem = {
	kind: 'subagent';
	id: string;
	at: string;
	title?: string | null;
	description?: string | null;
	state: SubagentState;
	items: (
		| SubagentItem
		| Extract<SubagentUpdate, { kind: 'message' }>
		| Extract<TranscriptItem, { kind: 'tool' }>
	)[];
};

/** Replace only the path to the changed reviewer. Prior edits may still be
 * waiting for delivery to a follower and must keep their original values. */
function subagentEdit(
	items: readonly (TranscriptItem | SubagentItem['items'][number])[],
	[id, ...nested]: string[],
	update: SubagentUpdate,
	at: string
): [number, number, SubagentItem] {
	const index = items.findIndex((item) => item.kind === 'subagent' && item.id === id);
	const previous = items[index];
	const child: SubagentItem =
		previous?.kind === 'subagent'
			? { ...previous }
			: { kind: 'subagent', id, at, state: 'unknown', items: [] };
	if (nested.length) {
		child.items = child.items.toSpliced(...subagentEdit(child.items, nested, update, at));
	} else if (update.kind === 'info') {
		if (update.title !== undefined) child.title = update.title;
		if (update.description !== undefined) child.description = update.description;
		if (update.state !== undefined) child.state = update.state;
	} else {
		const entryIndex = child.items.findIndex(
			(item) => item.kind === update.kind && item.id === update.id
		);
		const previousEntry = child.items[entryIndex];
		const entry =
			update.kind === 'message'
				? update
				: {
						name: 'Tool',
						input: '',
						output: null,
						isError: false,
						at,
						...(previousEntry?.kind === 'tool' && previousEntry),
						...update
					};
		child.items = entryIndex < 0 ? [...child.items, entry] : child.items.with(entryIndex, entry);
	}
	return index < 0 ? [items.length, 0, child] : [index, 1, child];
}

export type TranscriptItem =
	| SubagentItem
	/** `from`: the workspace whose agent said it, where it was not a person. */
	| {
			kind: 'user';
			text: string;
			images?: string[];
			at: string;
			from?: string;
			senderName?: string;
	  }
	| { kind: 'text'; text: string; at: string }
	| { kind: 'plan'; id: string; plan: AgentPlan; at: string }
	| ({
			kind: 'tool';
			id: string;
			name: string;
			input: string;
			output: string | null;
			isError: boolean;
			/** What it changed in files, once it succeeded; absent in events from before diffs were kept. */
			diff?: ToolDiff;
			at: string;
	  } & ToolInfo)
	| { kind: 'error'; error: string; at: string }
	/**
	 * A turn ends here (`at`): when it began, where that is known, and what it used, where
	 * its agent said.
	 */
	| { kind: 'turn'; diff?: TurnDiff; startedAt?: string; usage?: TurnUsage; at: string }
	/**
	 * Something the agent asked the person, which it waits to hear about. `answers` once it
	 * was answered; no longer `open` once it was, or the turn ended without.
	 */
	| {
			kind: 'question';
			id: string;
			questions: Question[];
			blocking?: boolean;
			delivery?: 'pending' | 'unconfirmed';
			answers: string[] | null;
			open: boolean;
			at: string;
	  }
	/** The agent compacted its context here (or tried to): a note, said in passing. */
	| ({ kind: 'compaction'; id: string; at: string } & Compaction)
	/** Something that happened to the workspace, said in passing: neither side's words. */
	| { kind: 'note'; text: string; at: string };

export type TranscriptEdit = [index: number, remove: number, ...items: TranscriptItem[]];
export type TranscriptUpdate = TranscriptItem[] | { edits: TranscriptEdit[] };

export type TranscriptFollower = { read(): TranscriptUpdate; close(): void };

type Asked = Extract<TranscriptItem, { kind: 'question' }>;

export function toolById(workspace: Workspace, id: string) {
	return workspace.transcript.findLast(
		(item): item is Extract<TranscriptItem, { kind: 'tool' }> =>
			item.kind === 'tool' && item.id === id
	);
}

export function questionById(workspace: Workspace, id: string) {
	return workspace.transcript.findLast(
		(item): item is Asked => item.kind === 'question' && item.id === id
	);
}

function updateAsking(workspace: Workspace) {
	workspace.asking = workspace.transcript.some(
		(item) => item.kind === 'question' && item.open && item.blocking !== false
	);
}

export type PendingMessage = { deliveryId: string; text: string; images: string[] };

export type Status = 'running' | 'idle';

/**
 * A piece of work: one conversation with one agent, in a worktree on its own branch
 * (FDR-001). A workspace started by another workspace's agent may work in that one's
 * worktree instead of its own.
 */
export type Workspace = {
	activeAction?: ActionId;
	queuedActions?: (ActionId | null)[];
	outputCursor?: string;
	pendingMessages?: PendingMessage[];
	/** When the turn that is running began, for the `turn` item that ends it. */
	turnStartedAt?: string;
	id: string;
	/** `null` for a project: a workspace that belongs to no repository, for orchestrating (FDR-012). */
	repoId: string | null;
	worktreeParent?: string;
	title: string;
	/** Whether someone gave it its title on purpose (its agent, or the agent that started it). */
	named: boolean;
	manuallyNamed?: boolean;
	agent: Agent;
	/** The agent settings for its next turn. */
	settings: AgentSettings;
	status: Status;
	/** Whether its agent has asked the person something, and waits for the answer. */
	asking: boolean;
	/** How its latest turn ended; `null` while one is running, and before the first. */
	lastTurn: TurnEnd | null;
	/** How full its agent's context is, as it last said; `null` before it has. */
	usage: ContextUsage | null;
	/** What its agent suggests the person say next; `null` if nothing. */
	suggestion: string | null;
	/** The workspace whose agent started this one; `null` if a person did. */
	parentId: string | null;
	/** The external client (its grant) that started it, if one did: it may supervise it. */
	startedBy: string | null;
	/** The workspace whose worktree this one works in: its own ID, unless it shares another's. */
	worktreeId: string;
	/** The branch the worktree started from, if not the repository's checked-out one. */
	base: string | null;
	worktree: { path: string; branch: string } | null;
	/** The agent CLI's session ID, for resuming the conversation. */
	resumeId: string | null;
	/** Messages waiting for the agent to finish its turn, in the order they will be sent. */
	queue: string[];
	attachments: { queue: string[][] };
	/**
	 * Something the agent has to be told before anything else, with its next message: what
	 * happened to its workspace since it last looked.
	 */
	briefing: string | null;
	/** Who sent the messages that wait, in step with `queue`: workspace IDs, `null` for people. */
	sentBy: { queue: (string | null)[] };
	/** Children that have sent this workspace a message, including queued messages. */
	childSenders?: Record<string, string>;
	/** When the workspace was archived; `null` while it is in use. */
	archivedAt: string | null;
	/**
	 * Whether a person marked it inactive, and has not since made it, or anything it started,
	 * active again (by marking or prompting). What it started is inactive with it (`isInactive`).
	 */
	inactive: boolean;
	/** Whether a person locked it against archiving (FDR-015). */
	locked: boolean;
	createdAt: string;
	updatedAt: string;
	transcript: TranscriptItem[];
};

/** A turn begins: with a message to the agent, or because the agent says so. */
function startTurn(workspace: Workspace, at: string) {
	if (workspace.status !== 'running') workspace.turnStartedAt = at;
	workspace.status = 'running';
	workspace.lastTurn = null;
	// what it suggested was for the turn that ended, not for this one
	workspace.suggestion = null;
}

function initialWorkspace(
	created: Extract<CurrentEvent, { type: 'workspace.created' }>['data'],
	at: string,
	actor: string | null = null
): Workspace {
	const {
		repoId = null,
		parentId = null,
		worktreeId = created.id,
		base = null,
		settings = {},
		...data
	} = created;
	return {
		...data,
		repoId,
		named: false,
		settings,
		status: 'idle',
		asking: false,
		lastTurn: null,
		usage: null,
		suggestion: null,
		parentId,
		startedBy: actor && isExternal(actor) ? actor : null,
		worktreeId,
		base,
		worktree: null,
		resumeId: null,
		queue: [],
		attachments: { queue: [] },
		sentBy: { queue: [] },
		briefing: null,
		archivedAt: null,
		inactive: false,
		locked: false,
		createdAt: at,
		updatedAt: at,
		transcript: []
	};
}

/** What an agent is told, with its next message, after its workspace was continued. */
const continuedBriefing = (branch: string) =>
	`(A note from Geordi, not from the person: since your last turn, this workspace was continued. Its working directory is now on a new branch, \`${branch}\`, which starts from the latest state of the repository's main branch. What you did before is not on it unless it was merged; your earlier branch still exists. Look at the files as they are now before you rely on what you remember of them.)`;

/**
 * The workspaces projection. Mutates in place (O(1) per event during replay); whoever hands
 * a workspace out gives a copy. Also tells followers of a transcript each edit made to it.
 */
export function createWorkspaceProjection(store: EventStore<GeordiEvent>) {
	/**
	 * Who steered a workspace's agent in the way of before ADR-010 (`workspace.steered`), until
	 * the message that came of it: only ever set while old events are replayed.
	 */
	const steerers = new Map<string, string | null>();
	const listeners = new Map<string, Set<(edit: TranscriptEdit) => void>>();
	// The first session of an old workspace could have a different ID.
	const sessionStreams = new Map<string, string>();
	// All images ever attached, including messages withdrawn or still queued at archive.
	const attachedImages = new Map<string, Set<string>>();
	// Sender attribution on a later replay must reflect who existed at the time.
	const born = new Map<string, { seq: number; parentId?: string; purgedTitle?: string }>();

	function apply(
		workspaces: Map<string, Workspace>,
		event: CurrentEvent,
		at: string,
		actor: string | null,
		seq: number,
		steering = steerers,
		restoring = false
	) {
		/** Makes a workspace active, with those that started it: while one of them is inactive, so is it. */
		const activate = (id: string) => {
			for (const each of lineOf(workspaces, id)) each.inactive = false;
		};
		if (event.type === 'workspace.created') {
			const workspace = initialWorkspace(
				{ ...event.data, title: promptTitle(event.data.title) },
				at,
				actor
			);
			workspaces.set(workspace.id, workspace);
			return;
		}

		if (event.type === 'workspace.purged') {
			for (const { id } of event.data.workspaces) {
				workspaces.delete(id);
				sessionStreams.delete(id);
				attachedImages.delete(id);
				listeners.delete(id);
			}
			for (const { id, path, branch } of event.data.worktrees) {
				const owner = workspaces.get(id);
				if (owner) owner.worktree = { path, branch };
			}
			return;
		}

		if (event.type === 'workspace.moved') {
			move(workspaces, event.data.id, event.data.before);
			return;
		}
		// not something that happened in it: it leaves its place in the lists alone
		if (event.type === 'workspace.usage') {
			const measured = workspaces.get(event.data.id);
			if (measured) measured.usage = event.data.usage;
			return;
		}
		if (event.type === 'workspace.suggested') {
			const suggesting = workspaces.get(event.data.id);
			if (suggesting) suggesting.suggestion = event.data.text;
			return;
		}
		if (event.type === 'workspace.locked' || event.type === 'workspace.unlocked') {
			const locking = workspaces.get(event.data.id);
			if (locking) locking.locked = event.type === 'workspace.locked';
			return;
		}
		if (event.type === 'workspace.deactivated') {
			const marked = workspaces.get(event.data.id);
			if (marked) marked.inactive = true;
			return;
		}
		if (event.type === 'workspace.activated') {
			activate(event.data.id);
			return;
		}

		const workspace = workspaces.get(event.data.id);
		if (!workspace) return;
		workspace.updatedAt = at;
		const { id, transcript } = workspace;
		function edit(index: number, remove: number, ...items: TranscriptItem[]) {
			transcript.splice(index, remove, ...items);
			if (!restoring)
				for (const listener of listeners.get(id) ?? []) listener([index, remove, ...items]);
		}
		const append = (item: TranscriptItem) => edit(transcript.length, 0, item);
		/** Whether `sender` is an agent (a workspace, or an external client) rather than a person. */
		const byAgent = (sender: string | null): sender is string =>
			!!sender && (isExternal(sender) || (born.get(sender)?.seq ?? Infinity) <= seq);
		const rememberChild = (sender: string | null, name?: string) => {
			if (sender && born.get(sender)?.parentId === id) {
				(workspace.childSenders ??= {})[sender] =
					name ??
					workspaces.get(sender)?.title ??
					workspace.childSenders[sender] ??
					born.get(sender)?.purgedTitle ??
					'Child agent';
			}
		};

		/** A person prompted it: active again, with the workspace whose worktree it works in. */
		const prompted = () => {
			activate(workspace.id);
			activate(workspace.worktreeId);
		};
		const replace = (item: TranscriptItem, next: TranscriptItem) =>
			edit(transcript.indexOf(item), 1, next);
		function closeQuestion(question: Asked) {
			if (question.open || question.delivery === 'pending')
				replace(question, {
					...question,
					open: false,
					...(question.delivery === 'pending' && { delivery: 'unconfirmed' })
				});
		}

		if (event.type === 'workspace.titled') {
			workspace.title = event.data.title;
			// a title someone chose, as opposed to one its agent's session goes by
			if (actor) workspace.named = true;
			if (actor === 'person') workspace.manuallyNamed = true;
			return;
		}
		if (event.type === 'workspace.configured') {
			workspace.settings = event.data.settings;
			return;
		}
		if (event.type === 'workspace.continued') {
			const { branch } = event.data;
			// everyone who works in that worktree is on the new branch, measured against where it starts
			for (const other of workspaces.values()) {
				if (other.worktreeId !== workspace.worktreeId) continue;
				other.base = null;
				other.briefing = continuedBriefing(branch);
			}
			const owner = workspaces.get(workspace.worktreeId);
			if (owner?.worktree) owner.worktree = { ...owner.worktree, branch };
			append({ kind: 'note', text: `Continued on a new branch, ${branch}`, at });
			return;
		}
		if (event.type === 'workspace.based') {
			for (const other of workspaces.values())
				if (other.worktreeId === workspace.worktreeId) other.base = event.data.base ?? null;
			// what the changes are shown against is what is reviewed: nobody changes it unseen
			const by = byAgent(actor) ? `, as ${workspaces.get(actor)?.title ?? 'an agent'} said` : '';
			append({
				kind: 'note',
				text: `Now compared with ${event.data.base ?? 'the main branch'}${by}`,
				at
			});
			return;
		}
		if (event.type === 'workspace.switched') {
			if (workspace.worktree)
				workspace.worktree = { ...workspace.worktree, branch: event.data.branch };
			return;
		}
		if (event.type === 'workspace.restored') {
			if (!restoring) workspace.transcript = transcriptOf(workspace, seq);
			workspace.archivedAt = null;
			return;
		}
		if (event.type === 'workspace.archived') {
			workspace.archivedAt = at;
			if (!restoring) workspace.transcript = [];
			workspace.queue = [];
			delete workspace.queuedActions;
			workspace.attachments.queue = [];
			workspace.sentBy.queue = [];
			return;
		}
		if (event.type === 'workspace.queued') {
			if (event.data.action || workspace.queuedActions) {
				(workspace.queuedActions ??= Array(workspace.queue.length).fill(null)).push(
					event.data.action ?? null
				);
			}
			workspace.queue.push(event.data.text);
			workspace.attachments.queue.push(event.data.images ?? []);
			workspace.sentBy.queue.push(actor);
			rememberChild(actor);
			if (!byAgent(actor)) prompted();
			return;
		}
		if (event.type === 'workspace.dequeued') {
			workspace.queuedActions?.splice(event.data.index, 1);
			workspace.queue.splice(event.data.index, 1);
			workspace.attachments.queue.splice(event.data.index, 1);
			workspace.sentBy.queue.splice(event.data.index, 1);
			return;
		}
		if (event.type === 'workspace.steered') {
			steering.set(workspace.id, actor);
			return;
		}
		if (event.type === 'workspace.answered') {
			const question = questionById(workspace, event.data.question);
			if (question && (question.open || !event.data.pending)) {
				replace(question, {
					...question,
					answers: event.data.answers,
					open: false,
					...(event.data.pending && { delivery: 'pending' })
				});
				updateAsking(workspace);
			}
			return;
		}
		if (event.type === 'workspace.undeliverable') {
			workspace.pendingMessages = workspace.pendingMessages?.filter(
				(m) => m.deliveryId !== event.data.deliveryId
			);
			append({ kind: 'error', error: event.data.reason, at });
			return;
		}
		if (event.type === 'workspace.message') {
			if (event.data.deliveryId)
				(workspace.pendingMessages ??= []).push({
					deliveryId: event.data.deliveryId,
					text: workspace.briefing
						? workspace.briefing + '\n\n' + event.data.text
						: event.data.text,
					images: event.data.images ?? []
				});
			// said by whoever queued it, or steered with it, or says it now
			let sender = actor;
			workspace.activeAction = event.data.action;
			if (event.data.queued) {
				workspace.activeAction = workspace.queuedActions?.shift() ?? undefined;
				workspace.queue.shift();
				workspace.attachments.queue.shift();
				sender = workspace.sentBy.queue.shift() ?? null;
			}
			if (event.data.steered) {
				sender = steering.get(workspace.id) ?? null;
				steering.delete(workspace.id);
			}
			startTurn(workspace, at);
			workspace.briefing = null; // it went out with this message
			// an agent's word is marked as such; a person's is the rule
			const from = byAgent(sender) ? sender : undefined;
			if (!from) prompted();
			else rememberChild(from, event.data.senderName);
			append({
				kind: 'user',
				text: event.data.text,
				...(event.data.images?.length && { images: event.data.images }),
				at,
				...(from && { from }),
				...(event.data.senderName && { senderName: event.data.senderName })
			});
			return;
		}

		if (event.data.cursor) workspace.outputCursor = event.data.cursor;
		const output = event.data.event;
		switch (output.kind) {
			case 'subagent':
				if (output.path.length) edit(...subagentEdit(transcript, output.path, output.update, at));
				break;
			case 'message.received':
				workspace.pendingMessages = workspace.pendingMessages?.filter(
					(s) => s.deliveryId !== output.id
				);
				break;
			case 'worktree': {
				// the worktree belongs to whoever owns it, which may be another workspace
				const owner = workspaces.get(workspace.worktreeId);
				if (owner) owner.worktree = { path: output.path, branch: output.branch };
				break;
			}
			case 'resume':
				workspace.resumeId = output.id;
				break;
			case 'text':
				append({ kind: 'text', text: output.text, at });
				break;
			case 'plan': {
				const index = transcript.findIndex((item) => item.kind === 'plan' && item.id === output.id);
				// Wrappers can reuse a session-wide checklist in the next exchange.
				// Bring it into that reply so live updates stay visible.
				const previous = transcript[index];
				const exchange = transcript.findLastIndex(
					(item) => item.kind === 'user' || item.kind === 'note'
				);
				if (output.plan && previous?.kind === 'plan' && index > exchange) {
					edit(index, 1, { ...previous, plan: output.plan });
				} else {
					if (index >= 0) edit(index, 1);
					if (output.plan) append({ ...output, plan: output.plan, at });
				}
				break;
			}
			case 'compaction': {
				const { kind, id, ...compaction } = output;
				const previous = transcript.findLast(
					(item) => item.kind === 'compaction' && item.id === id
				);
				// it stays where it began
				if (previous) replace(previous, { kind, id, ...compaction, at: previous.at });
				else append({ kind, id, ...compaction, at });
				break;
			}
			case 'tool':
				append({ ...output, output: null, isError: false, at });
				break;
			case 'tool.update': {
				const tool = toolById(workspace, output.id);
				if (tool) replace(tool, { ...tool, ...output, kind: 'tool' });
				break;
			}
			case 'tool.result': {
				const tool = toolById(workspace, output.id);
				if (tool)
					replace(tool, {
						...tool,
						output: output.output,
						isError: output.isError,
						...(output.diff && { diff: output.diff })
					});
				break;
			}
			case 'answer.received': {
				const question = questionById(workspace, output.id);
				if (question?.answers && question.delivery) {
					const next = { ...question };
					delete next.delivery;
					replace(question, next);
				}
				break;
			}
			case 'question.closed': {
				const question = questionById(workspace, output.id);
				if (question) closeQuestion(question);
				updateAsking(workspace);
				break;
			}
			case 'question':
				if (questionById(workspace, output.id)) break;
				append({ ...output, answers: null, open: true, at });
				if (output.blocking !== false) workspace.asking = true;
				break;
			case 'turn.started':
				startTurn(workspace, at);
				break;
			case 'turn.completed':
			case 'turn.failed':
				delete workspace.activeAction;
				workspace.status = 'idle';
				// a turn that is over waits for no answer
				workspace.asking = false;
				for (const item of transcript) {
					if (item.kind === 'question') closeQuestion(item);
					// one its agent never said the end of ended with the turn
					else if (item.kind === 'compaction' && item.status === 'running')
						replace(item, { ...item, status: 'cancelled' });
				}
				if (output.kind === 'turn.failed') {
					workspace.pendingMessages = [];
					workspace.lastTurn = output.error === 'Stopped' ? 'stopped' : 'failed';
					// (before ADR-010) stopped to make way for a steering message: not a failure worth showing
					if (!(output.error === 'Stopped' && steering.has(workspace.id)))
						append({ kind: 'error', error: output.error, at });
				} else workspace.lastTurn = 'completed';
				append({
					kind: 'turn',
					...(workspace.turnStartedAt && { startedAt: workspace.turnStartedAt }),
					...(output.usage && { usage: output.usage }),
					...(output.diff && { diff: output.diff }),
					at
				});
				delete workspace.turnStartedAt;
				break;
		}
	}

	/**
	 * Puts a workspace right above another in the list, or last. The map is in the order
	 * lists show reversed (oldest first), so above means after.
	 */
	function move(workspaces: Map<string, Workspace>, id: string, before: string | null) {
		const moving = workspaces.get(id);
		if (!moving || id === before) return;
		const entries = [...workspaces].filter(([other]) => other !== id);
		const at = before === null ? 0 : entries.findIndex(([other]) => other === before) + 1;
		if (at === 0 && before !== null) return; // gone: it stays where it is
		entries.splice(at, 0, [id, moving]);
		workspaces.clear();
		for (const [other, workspace] of entries) workspaces.set(other, workspace);
	}

	// Mutates in place (O(1) per event during replay); readers get copies. Events from
	// before a workspace had exactly one conversation are translated first (see legacy.ts).
	const upcast = createUpcaster();
	// Purged workspaces were workspaces from when they were born, which replay no longer sees.
	for (const event of store.readStream('purges'))
		if (event.type === 'workspace.purged')
			for (const { id, born: seq, parentId, title } of event.data.workspaces)
				born.set(id, { seq, parentId, purgedTitle: title });
	const projection = store.project(
		'workspaces',
		() => new Map<string, Workspace>(),
		(workspaces, event) => {
			for (const current of upcast(event)) {
				if (current.type === 'workspace.created') {
					born.set(current.data.id, { seq: event.seq, parentId: current.data.parentId });
					if (event.type === 'session.created') sessionStreams.set(current.data.id, event.stream);
				}
				if (
					(current.type === 'workspace.queued' ||
						current.type === 'workspace.message' ||
						current.type === 'workspace.steered') &&
					current.data.images?.length
				) {
					const { id, images } = current.data;
					const attached = attachedImages.get(id) ?? new Set<string>();
					for (const image of images) attached.add(image);
					attachedImages.set(id, attached);
				}
				apply(workspaces, current, event.at, event.actor, event.seq);
			}
			return workspaces;
		},
		['workspace', 'session']
	);

	// Reuse the normal reducer for a private reconstruction. Session mappings were learned
	// during replay. Never feed creation events back into that stateful upcaster.
	function transcriptOf(workspace: Workspace, before = Infinity): TranscriptItem[] {
		if (!workspace.archivedAt) return workspace.transcript;
		const { id, repoId, agent, title } = workspace;
		const restored = initialWorkspace(
			{ id, ...(repoId && { repoId }), agent, title },
			workspace.createdAt
		);
		const copy = new Map([[id, restored]]);
		const steering = new Map<string, string | null>();
		const createdAtSeq = born.get(id)!.seq;
		const events = store.readStream(`workspace:${id}`);
		const session = sessionStreams.get(id);
		if (session) {
			for (const event of store.readStream(session)) events.push(event);
			events.sort((a, b) => a.seq - b.seq);
		}
		for (const event of events) {
			if (event.seq >= before) break;
			if (event.seq <= createdAtSeq) continue;
			if (event.type === 'workspace.created' || event.type === 'session.created') continue;
			for (const current of upcast(event))
				apply(copy, current, event.at, event.actor, event.seq, steering, true);
		}
		return restored.transcript;
	}

	return {
		get: projection.get,
		/** A workspace's transcript; an archived one's is read again from the log. */
		transcriptOf,
		/** Only release image IDs when every workspace that used them goes. */
		imagesOnlyIn(ids: Set<string>): string[] {
			const images = new Set<string>();
			for (const id of ids) for (const image of attachedImages.get(id) ?? []) images.add(image);
			for (const [id, attached] of attachedImages) {
				if (!images.size) break;
				if (!ids.has(id)) for (const image of attached) images.delete(image);
			}
			return [...images];
		},
		/** The streams a workspace's events are in: its own, and that of the session it began as. */
		streamsOf(id: string): string[] {
			const session = sessionStreams.get(id);
			return [`workspace:${id}`, ...(session ? [session] : [])];
		},
		/** The `seq` a workspace was created at. */
		bornAt: (id: string) => born.get(id)?.seq,
		/** Tells `listener` each edit of a workspace's transcript, until the returned function is called. */
		followEdits(id: string, listener: (edit: TranscriptEdit) => void): () => void {
			const followers = listeners.get(id) ?? new Set<(edit: TranscriptEdit) => void>();
			listeners.set(id, followers);
			followers.add(listener);
			return () => {
				followers.delete(listener);
				if (!followers.size) listeners.delete(id);
			};
		}
	};
}
