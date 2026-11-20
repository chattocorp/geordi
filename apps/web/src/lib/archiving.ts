import type { Changes, Upstream } from '@geordi/protocol';

export type Standing = {
	/** `null` if a daemon couldn't say. */
	changes: Pick<Changes, 'files' | 'uncommitted' | 'unpushed' | 'unmerged'> | null;
	/** `null` if the repository is on no forge we know; absent if there was no telling in time. */
	upstream?: Upstream | null;
};

/**
 * What is unfinished about a workspace that someone is about to archive, in sentences to
 * show them first (FDR-001): work that would be lost, and work that is nowhere but here.
 * Nothing to say about work that has landed, or where a daemon couldn't tell.
 */
export function archiveConcerns({ changes, upstream }: Standing): string[] {
	const pull = upstream?.pull;
	const pullConcern =
		pull?.state === 'open' || pull?.state === 'closed' ? ['Pull requests remain unmerged.'] : [];
	if (!changes) return pullConcern;
	const concerns: string[] = [];
	if (changes.uncommitted > 0) concerns.push('Uncommitted changes will be discarded.');

	if (pull?.state === 'merged' && !changes.unpushed) return concerns;

	// committed work: commits the upstream doesn't have, or changes beyond the uncommitted ones
	const committed =
		changes.unmerged ?? ((changes.unpushed ?? 0) > 0 || changes.files.length > changes.uncommitted);
	if (!committed) return concerns.concat(pullConcern);

	if (changes.unpushed === null || changes.unpushed > 0)
		concerns.push('Unpushed commits will stay on local branches.');

	if (pullConcern.length) concerns.push(...pullConcern);
	else if ((!pull && upstream !== undefined && changes.unpushed !== null) || changes.unpushed === 0)
		concerns.push('Branches contain unmerged commits.');
	return concerns;
}
