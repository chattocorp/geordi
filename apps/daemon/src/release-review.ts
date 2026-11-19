import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReleaseIncrease, ReleasePackage, ReleaseReview } from '@geordi/protocol';
import { git } from './git.ts';
import { releaseAdapter, type ReleaseAdapter } from './releases.ts';
import { gitIn, type Worktree } from './worktree.ts';

type Package = Omit<ReleasePackage, 'notes'>;
const levels = ['none', 'patch', 'minor', 'major'];

export function releaseIncreases(before: Package[], after: Package[]): ReleaseIncrease[] {
	for (const pkg of [...before, ...after]) {
		const problem =
			pkg.problems[0] ||
			(!levels.includes(pkg.bump) && 'Unknown release level') ||
			(pkg.bump !== 'none' && !pkg.nextVersion && 'Missing next version');
		if (problem) throw new Error(`${pkg.name ?? pkg.path}: ${problem}`);
	}
	const prior = new Map(before.map((p) => [p.path, p]));
	const increases: ReleaseIncrease[] = [];
	for (const pkg of after) {
		const previous = prior.get(pkg.path);
		const from = previous?.bump ?? 'none';
		if (levels.indexOf(pkg.bump) <= Math.max(1, levels.indexOf(from))) continue;
		increases.push({
			path: pkg.path,
			name: pkg.name ?? pkg.path,
			from,
			before: previous?.nextVersion ?? pkg.version,
			to: pkg.bump,
			after: pkg.nextVersion!
		});
	}
	return increases;
}

async function adapterAt(worktree: Worktree, revision: string) {
	const paths = (await gitIn(worktree, 'ls-tree', '-r', '--name-only', '-z', revision)).split('\0');
	return releaseAdapter(worktree, undefined, paths);
}

type Target = { number: string; head: string; base?: string; branch: string };
const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Compare committed trees in a private checkout. Never switch, clean or install into the person's worktree. */
export async function reviewRelease(
	worktree: Worktree,
	target: Target,
	approved: (command: string) => boolean,
	auto: boolean,
	confirmation?: string
): Promise<ReleaseReview | null> {
	let base = target.base;
	let problem: string | null = null;
	let increases: ReleaseIncrease[] = [];
	try {
		if (!base) {
			const ref = `refs/heads/${target.branch}`;
			base = (await gitIn(worktree, 'ls-remote', '--refs', 'origin', ref)).split(/\s/)[0];
		}
		if (!oid.test(base) || !oid.test(target.head))
			throw new Error('The forge did not supply the pull request revisions');
		try {
			await gitIn(worktree, 'cat-file', '-e', base);
		} catch {
			await gitIn(worktree, 'fetch', '--no-tags', '--no-write-fetch-head', 'origin', base);
		}
		const before = await adapterAt(worktree, base);
		const headAdapter = await adapterAt(worktree, target.head);
		if (!before && !headAdapter) return null;
		const tree = (await gitIn(worktree, 'merge-tree', '--write-tree', base, target.head)).trim();
		if (!oid.test(tree)) throw new Error('Could not prepare the proposed merge');
		const after = await adapterAt(worktree, tree);
		if (before && after !== before)
			throw new Error('The pull request removes or replaces the release tool');
		if (!after) return null;
		if (!approved(after.command))
			throw new Error(`Allow ${after.name} in the Changeset tab to check this release.`);
		increases = await compareTrees(worktree, after, base, tree, !!before);
	} catch (error) {
		problem = error instanceof Error ? error.message : String(error);
	}
	if (!problem && !increases.length) return null;
	// A response authorizes only the action and revisions presented. A retry always reads both plans again.
	const token = createHash('sha256')
		.update(
			JSON.stringify([
				target.number,
				target.branch,
				base,
				target.head,
				auto,
				problem ? 'unavailable' : increases
			])
		)
		.digest('hex');
	if (confirmation === token && !(auto && problem)) return null;
	return { token, problem, increases };
}

async function compareTrees(
	source: Worktree,
	adapter: ReleaseAdapter,
	base: string,
	tree: string,
	hadTool: boolean
) {
	const path = await mkdtemp(join(tmpdir(), 'geordi-release-review-'));
	try {
		await git(path, ['clone', '--quiet', '--shared', '--no-checkout', '--', source.commonDir, '.']);
		const commonDir = join(path, '.git');
		const snapshot = { path, commonDir, adminDir: commonDir, branch: '' };
		await gitIn(snapshot, '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', base);
		const pending = hadTool ? await adapter.read(snapshot) : [];
		await gitIn(snapshot, 'read-tree', '--reset', '-u', tree);
		return releaseIncreases(pending, await adapter.read(snapshot));
	} finally {
		await rm(path, { recursive: true, force: true });
	}
}
