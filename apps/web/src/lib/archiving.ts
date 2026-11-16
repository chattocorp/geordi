import type { Changes, Upstream } from '@geordi/protocol';

export type Standing = {
	/** `null` if a daemon couldn't say. */
	changes: Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> | null;
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
	if (!changes) return [];
	const concerns: string[] = [];
	if (changes.uncommitted > 0)
		concerns.push(
			`${count(changes.uncommitted, 'file has', 'files have')} uncommitted changes, which will be discarded.`
		);

	const pull = upstream?.pull;
	if (pull?.state === 'merged') return concerns; // what was committed has landed

	// committed work: commits the upstream doesn't have, or changes beyond the uncommitted ones
	const committed = (changes.unpushed ?? 0) > 0 || changes.files.length > changes.uncommitted;
	if (!committed) return concerns;

	if (changes.unpushed === null)
		concerns.push('Its commits were never pushed. They stay on its branch, on this machine only.');
	else if (changes.unpushed > 0)
		concerns.push(
			`${count(changes.unpushed, 'commit is', 'commits are')} not pushed. They stay on its branch, on this machine only.`
		);

	// without word from the forge, there is nothing to say about a pull request
	if (upstream === undefined) return concerns;
	if (pull?.state === 'open') concerns.push(`Pull request #${pull.number} is not merged.`);
	else if (!pull && changes.unpushed !== null)
		concerns.push('Its changes are not merged, and there is no pull request for them.');
	return concerns;
}
