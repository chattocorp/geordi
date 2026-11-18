import type { WorkspaceLive, WorkspaceUpdate } from './server/views.ts';
import type { TranscriptItem, TranscriptUpdate } from './server/workspaces.ts';

function apply(previous: TranscriptItem[] | undefined, update: TranscriptUpdate) {
	if (Array.isArray(update)) return update;
	if (!previous) throw new Error('Transcript edit before snapshot');
	if (!update.edits.length) return previous;
	const items = previous.slice();
	for (const [index, remove, ...added] of update.edits) items.splice(index, remove, ...added);
	return items;
}

export function applyWorkspaceUpdate(
	previous: WorkspaceLive | undefined,
	update: WorkspaceUpdate
): WorkspaceLive {
	return {
		...update,
		transcript: apply(previous?.transcript, update.transcript),
		aides: update.aides.map((aide) => ({
			...aide,
			transcript: apply(
				previous?.aides.find((other) => other.id === aide.id)?.transcript,
				aide.transcript
			)
		}))
	};
}
