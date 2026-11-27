import { execFile } from 'node:child_process';
import { devNull } from 'node:os';
import { promisify } from 'node:util';
import type { TurnBlobs } from '@geordi/protocol';
import { git } from './git.ts';
import { archivedBranches } from './worktree.ts';
import { MAX_FILE } from './changes.ts';

const run = promisify(execFile);

/** Read only the recorded object. Old patches contain abbreviated IDs, which can become ambiguous. */
async function contents(repoPath: string, id: string | null) {
	if (id === null) return null;
	if (!/^[a-f0-9]{4,64}$/.test(id)) throw new Error('Invalid Git blob ID');
	const flags = ['--no-replace-objects'];
	const oid = (await git(repoPath, [...flags, 'rev-parse', '--disambiguate=' + id])).trim();
	if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) throw new Error('Missing or ambiguous blob');
	if ((await git(repoPath, [...flags, 'cat-file', '-t', oid])).trim() !== 'blob')
		throw new Error('Expected a blob');
	const { stdout } = await run('git', [...flags, 'cat-file', 'blob', oid], {
		cwd: repoPath,
		encoding: 'buffer',
		maxBuffer: MAX_FILE,
		timeout: 10_000
	});
	if (stdout.includes(0)) throw new Error('Binary file');
	return stdout.toString('utf8');
}

export async function turnFile(repoPath: string, blobs: TurnBlobs) {
	try {
		const [old, current] = await Promise.all([
			contents(repoPath, blobs.old),
			contents(repoPath, blobs.new)
		]);
		return { old, new: current };
	} catch {
		return null;
	}
}

/** Purging a workspace releases only its pins. Archiving removes its worktree but keeps these refs. */
export async function releaseTurnRefs(repoPath: string, workspaceIds: string[]) {
	const purged = new Set(workspaceIds);
	const prefixes = ['refs/geordi/turns/', archivedBranches];
	const refs = await git(repoPath, ['for-each-ref', '--format=%(refname)', ...prefixes]);
	for (const ref of refs.trimEnd().split('\n')) {
		if (
			prefixes.some(
				(prefix) => ref.startsWith(prefix) && purged.has(ref.slice(prefix.length).split('/')[0])
			)
		)
			await git(repoPath, [
				'-c',
				'core.hooksPath=' + devNull,
				'update-ref',
				'--no-deref',
				'-d',
				ref
			]);
	}
}
