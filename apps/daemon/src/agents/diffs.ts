import {
	ToolCallContent,
	type ToolCallUpdate
} from '@agentclientprotocol/sdk/experimental/v2/unstable';
import type { ToolDiff } from '@geordi/protocol';

/** A patch is history worth keeping, but a whole new file can be huge: past this, say so instead. */
export const MAX_PATCH = 32 * 1024;

/**
 * The `diff` entries of a tool call update, as one `ToolDiff`: the agents send one entry
 * per file. `undefined` if the update has none. Only git patches are kept; another format
 * (or none) still lists its files.
 */
export function toolDiff(u: ToolCallUpdate): ToolDiff | undefined {
	const entries = u.content?.filter(ToolCallContent.isDiff) ?? [];
	if (!entries.length) return;
	const files: ToolDiff['files'] = [];
	const patches: string[] = [];
	for (const entry of entries) {
		for (const change of entry.changes ?? []) {
			if (typeof change.path !== 'string') continue;
			files.push({
				operation: String(change.operation),
				path: change.path,
				...('oldPath' in change &&
					typeof change.oldPath === 'string' && { oldPath: change.oldPath }),
				...(typeof change.fileType === 'string' && { fileType: change.fileType })
			});
		}
		if (entry.patch?.format === 'git_patch' && typeof entry.patch.text === 'string')
			patches.push(entry.patch.text.replace(/\n?$/, '\n'));
	}
	const patch = patches.join('');
	if (!files.length && !patch) return;
	if (patch.length > MAX_PATCH) return { files, tooLarge: true };
	return { files, ...(patch && { patch }) };
}

/** Remembers each call's latest diff (it may come in any update), for when the call completes. */
export class ToolDiffs {
	private diffs = new Map<string, ToolDiff>();

	receive(u: ToolCallUpdate) {
		const diff = toolDiff(u);
		if (diff) this.diffs.set(u.toolCallId, diff);
	}
	/** The call's diff, if it completed with one: a failed edit changed nothing. Forgets it. */
	take(u: ToolCallUpdate): ToolDiff | undefined {
		const diff = this.diffs.get(u.toolCallId);
		this.diffs.delete(u.toolCallId);
		return u.status === 'completed' ? diff : undefined;
	}
}
