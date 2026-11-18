import type { Changes, Upstream } from '@geordi/protocol';

export type Standing = {
	/** `null` if a daemon couldn't say. */
	changes: Pick<Changes, 'files' | 'uncommitted' | 'unpushed' | 'unmerged'> | null;
	/** `null` if the repository is on no forge we know; absent if there was no telling in time. */
	upstream?: Upstream | null;
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What is unfinished about a workspace that someone is about to archive, in sentences to
 * show them first (FDR-001): work that would be lost, and work that is nowhere but here.
 * Nothing to say about work that has landed, or where a daemon couldn't tell.
 */
export function archiveConcerns({ changes, upstream }: Standing): string[] {
	const pull = upstream?.pull;
	const pullConcern =
		pull?.state === 'open' || pull?.state === 'closed'
			? [`Pull request #${pull.number} is not merged.`]
			: [];
	if (!changes) return pullConcern;
	const concerns: string[] = [];
	if (changes.uncommitted > 0)
		concerns.push(
			`${count(changes.uncommitted, 'file has', 'files have')} uncommitted changes, which will be discarded.`
		);

	if (pull?.state === 'merged' && !changes.unpushed) return concerns;

	// committed work: commits the upstream doesn't have, or changes beyond the uncommitted ones
	const committed =
		changes.unmerged ?? ((changes.unpushed ?? 0) > 0 || changes.files.length > changes.uncommitted);
	if (!committed) return concerns.concat(pullConcern);

	if (changes.unpushed === null)
		concerns.push('Its commits were never pushed. They stay on its branch, on this machine only.');
	else if (changes.unpushed > 0)
		concerns.push(
			`${count(changes.unpushed, 'commit is', 'commits are')} not pushed. They stay on its branch, on this machine only.`
		);

	if (pullConcern.length) concerns.push(...pullConcern);
	else if (!pull && upstream !== undefined && changes.unpushed !== null)
		concerns.push('Its changes are not merged, and there is no pull request for them.');
	else if (changes.unpushed === 0) concerns.push('Its branch has unmerged commits.');
	return concerns;
}
