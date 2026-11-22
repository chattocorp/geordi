import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
		if (previous?.nextVersion === pkg.nextVersion) continue;
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
	return increases.sort((a, b) => a.path.localeCompare(b.path));
}

async function adapterAt(worktree: Worktree, revision: string) {
	const paths = (await gitIn(worktree, 'ls-tree', '-r', '--name-only', '-z', revision)).split('\0');
	return releaseAdapter(worktree, undefined, paths);
}

type Target = { number: string; head: string; base?: string; branch: string };
const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The tree the merge would produce. Git says a merge has conflicts by exiting with 1. */
async function mergeTree(worktree: Worktree, base: string, target: Target) {
	try {
		return (await gitIn(worktree, 'merge-tree', '--write-tree', base, target.head)).trim();
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 1)
			throw new Error(`The pull request has merge conflicts with ${target.branch}`);
		throw error;
	}
}

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
		if (!before && !(await adapterAt(worktree, target.head))) return null;
		const tree = await mergeTree(worktree, base, target);
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

/**
 * Where to find the release tool: the repository's own checkout, whose tool manager (mise)
 * configuration the person trusts. Never the snapshot (mise refuses a path it was never told
 * to trust) nor the workspace's worktree (an agent could point the tool at another program).
 * A bare repository has no checkout: then the snapshot (or the temporary directory), which
 * fails rather than trusts.
 */
const toolsAt = ({ commonDir }: Worktree) =>
	basename(commonDir) === '.git' ? dirname(commonDir) : null;

async function compareTrees(
	source: Worktree,
	adapter: ReleaseAdapter,
	base: string,
	tree: string,
	hadTool: boolean
) {
	if (adapter.readAt) {
		// The tool reads both trees from the repository's objects: nothing to check out.
		const tools = toolsAt(source) ?? tmpdir();
		const pending = hadTool ? await adapter.readAt(source, base, tools) : [];
		return releaseIncreases(pending, await adapter.readAt(source, tree, tools));
	}
	// Tools that read only files on disk (Changesets) get a private checkout of each tree.
	const path = await mkdtemp(join(tmpdir(), 'geordi-release-review-'));
	try {
		await git(path, ['clone', '--quiet', '--shared', '--no-checkout', '--', source.commonDir, '.']);
		const commonDir = join(path, '.git');
		// Release tools read manifests and notes, never what a filter (Git LFS) makes of a file:
		// checking out pointers instead keeps a repository full of media from taking minutes.
		await mkdir(join(commonDir, 'info'), { recursive: true });
		await writeFile(join(commonDir, 'info', 'attributes'), '* -filter\n');
		const snapshot = { path, commonDir, adminDir: commonDir, branch: '' };
		await gitIn(snapshot, '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', base);
		const tools = toolsAt(source) ?? path;
		const pending = hadTool ? await adapter.read(snapshot, tools) : [];
		await gitIn(snapshot, 'read-tree', '--reset', '-u', tree);
		return releaseIncreases(pending, await adapter.read(snapshot, tools));
	} finally {
		await rm(path, { recursive: true, force: true });
	}
}
