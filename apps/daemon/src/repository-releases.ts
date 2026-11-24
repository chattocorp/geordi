import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ReleasePlan, RepositoryRelease } from '@geordi/protocol';
import { git, quietGit } from './git.ts';
import { adapterAt, toolsAt, withSnapshot } from './release-review.ts';
import { startOf, type Worktree } from './worktree.ts';
import { subscribe } from './watch.ts';

type Approvals = {
	has(path: string, command: string): boolean;
	add(path: string, command: string): void;
};

async function planAt(
	source: Worktree,
	commit: string,
	approvals: Approvals,
	allow?: string
): Promise<ReleasePlan | null> {
	const adapter = await adapterAt(source, commit);
	if (!adapter) return null;
	const { tool, name, command } = adapter;
	const plan: ReleasePlan = { tool, name, packages: [], ask: null, problem: null };
	if (allow === command) approvals.add(source.path, command);
	if (!approvals.has(source.path, command)) return { ...plan, ask: command };
	try {
		const packages = adapter.readAt
			? await adapter.readAt(source, commit, toolsAt(source) ?? tmpdir())
			: await withSnapshot(source, commit, (snapshot, tools) => adapter.read(snapshot, tools));
		plan.packages = packages.map((pkg) => ({
			...pkg,
			notes: pkg.notes.map((note) => ({ ...note, added: false }))
		}));
	} catch (error) {
		plan.problem = error instanceof Error ? error.message : String(error);
	}
	return plan;
}

function watchBase(commonDir: string, adminDir: string, changed: () => void) {
	const top = (dir: string) =>
		subscribe(
			dir,
			false,
			(_, name) => {
				if (!name || ['HEAD', 'packed-refs', 'refs'].includes(name)) changed();
			},
			changed
		);
	const stops = [top(commonDir), subscribe(join(commonDir, 'refs'), true, changed, changed)];
	if (adminDir !== commonDir) stops.push(top(adminDir));
	return () => stops.forEach((stop) => stop());
}

/** Follow committed base revisions, including repositories without a workspace. */
function follow(path: string, approvals: Approvals, publish: (release: RepositoryRelease) => void) {
	let stopped = false;
	let previous: string | undefined;
	let source: Worktree | undefined;
	let unwatch: (() => void) | undefined;
	// macOS can coalesce directory events. A watch on the loose ref itself reports
	// its atomic replacement through kqueue. Reattach to the new inode after a write.
	let refFile: string | undefined;
	let stopRef: (() => void) | undefined;
	function followRef(file: string) {
		if (process.platform !== 'darwin' || stopped || file === refFile) return;
		stopRef?.();
		stopRef = undefined;
		refFile = undefined;
		if (!existsSync(file)) return; // packed refs are covered by the directory watch
		refFile = file;
		const replaced = () => {
			stopRef?.();
			stopRef = undefined;
			refFile = undefined;
			changed();
		};
		stopRef = subscribe(file, false, replaced, replaced);
	}
	let queue = Promise.resolve();
	let timer: NodeJS.Timeout | undefined;
	function changed() {
		clearTimeout(timer);
		timer = setTimeout(() => void refresh(false), 250);
	}
	async function read(force: boolean, allow?: string) {
		if (stopped) return;
		let branch: string | null = null;
		try {
			if (!source) {
				const dirs = await git(path, [
					'rev-parse',
					'--path-format=absolute',
					'--git-common-dir',
					'--git-dir'
				]);
				if (stopped) return;
				const [commonDir, adminDir] = dirs.trimEnd().split('\n');
				source = { path, commonDir, adminDir, branch: '' };
				unwatch = watchBase(commonDir, adminDir, changed);
			}
			const ref = await startOf(path);
			const local = ref === 'HEAD' ? await quietGit(path, 'symbolic-ref', '--quiet', 'HEAD') : null;
			const fullRef = local ?? ref;
			followRef(
				fullRef === 'HEAD' ? join(source.adminDir, 'HEAD') : join(source.commonDir, fullRef)
			);
			const commit = (await git(path, ['rev-parse', '--verify', fullRef + '^{commit}'])).trim();
			branch =
				fullRef === 'HEAD'
					? commit.slice(0, 8)
					: fullRef.replace(/^refs\/(?:heads|remotes\/origin)\//, '');
			const key = JSON.stringify([branch, commit]);
			if (!force && previous === key) return;
			const plan = await planAt(source, commit, approvals, allow);
			previous = key;
			if (!stopped) publish({ branch, plan, problem: null });
		} catch (error) {
			previous = undefined;
			if (!stopped)
				publish({
					branch,
					plan: null,
					problem: error instanceof Error ? error.message : String(error)
				});
		}
	}
	function refresh(force = true, allow?: string) {
		queue = queue.then(() => read(force, allow));
		return queue;
	}
	void refresh();
	return {
		refresh,
		stop() {
			stopped = true;
			clearTimeout(timer);
			unwatch?.();
			stopRef?.();
		}
	};
}

export function watchRepositoryReleases(
	approvals: Approvals,
	publish: (path: string, release: RepositoryRelease) => void
) {
	const entries = new Map<string, ReturnType<typeof follow>>();
	return {
		set(paths: string[]) {
			for (const [path, entry] of entries)
				if (!paths.includes(path)) {
					entry.stop();
					entries.delete(path);
				}
			for (const path of paths)
				if (!entries.has(path))
					entries.set(
						path,
						follow(path, approvals, (release) => publish(path, release))
					);
		},
		refresh(path: string, allow?: string) {
			return entries.get(path)?.refresh(true, allow);
		}
	};
}
