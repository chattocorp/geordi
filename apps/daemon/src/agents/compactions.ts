import {
	SessionUpdate,
	type CompactionUpdate
} from '@agentclientprotocol/sdk/experimental/v2/unstable';
import type { AgentEvent, Compaction } from '@geordi/protocol';

type Said = Extract<AgentEvent, { kind: 'compaction' }>;

/** How full the context was before and after: Claude's facts for AIR (`contextCompaction`). */
function counts(meta: CompactionUpdate['_meta']): Partial<Compaction> {
	const air = (meta?.jetbrains as { air?: { contextCompaction?: Record<string, unknown> } })?.air
		?.contextCompaction;
	const { preTokens, postTokens } = air ?? {};
	return typeof preTokens === 'number' && typeof postTokens === 'number'
		? { tokensBefore: preTokens, tokensAfter: postTokens }
		: {};
}

/**
 * ACP's compaction lifecycle, reduced to what Geordi shows: that a compaction runs, and how
 * it ended. What the agent kept of the conversation is never kept or passed on.
 */
export class Compactions {
	#said = new Map<string, Said>();

	/** Whether this is a compaction update at all; `emit` hears of each change. */
	receive(u: SessionUpdate, emit: (event: Said) => void): boolean {
		if (SessionUpdate.isCompactionSummaryChunk(u)) return true;
		if (!SessionUpdate.isCompactionUpdate(u)) return false;
		const was = this.#said.get(u.compactionId);
		// An end is final, though Claude says it again with the counts (`compact_boundary`).
		const status =
			was && was.status !== 'running'
				? was.status
				: u.status === 'completed' || u.status === 'failed' || u.status === 'cancelled'
					? u.status
					: 'running';
		const event: Said = {
			...was,
			kind: 'compaction',
			id: u.compactionId,
			status,
			...counts(u._meta)
		};
		if (JSON.stringify(event) === JSON.stringify(was)) return true;
		this.#said.set(u.compactionId, event);
		emit(event);
		return true;
	}
}
