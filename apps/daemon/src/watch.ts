import { watch, type FSWatcher } from 'node:fs';
import { basename, isAbsolute, join, sep } from 'node:path';
import type { WatchScope, WorktreeRef } from '@geordi/protocol';
import { addFileScope, type FileChanges } from './file-index.ts';
import { branchOf, type Worktree } from './worktree.ts';

/** Changes come in bursts (a save, a checkout, an install); report each burst once. */
const SETTLE_MS = 250;

/**
 * Calls `onChange` when anything changes that the workspace's changes or pull request
 * depend on: its files, what it has checked out and staged, and the repository's branches
 * (commits, and pushes, which move the remote-tracking branches). Returns a function that
 * stops watching.
 *
 * Without `files` (a worktree nobody has open), only its Git state: a handful of small
 * directories, cheap on every platform (our own Git leaves the index alone:
 * `GIT_OPTIONAL_LOCKS`). And of the branches, which every worktree of the repository shares,
 * only its own, here and on the remotes: a fetch or a commit elsewhere is none of its business.
 */
export function watchWorktree(
	worktree: Worktree,
	onChange: () => void,
	files = true,
	onNames?: (changes?: FileChanges) => void
): () => void {
	let settle: NodeJS.Timeout | undefined;
	// Name updates have their own short batch so ongoing writes cannot delay the picker.
	let namesTimer: NodeJS.Timeout | undefined;
	let paths: Set<string> | undefined = new Set();
	let gitIndex = false;
	const names = (path?: string, staged = false) => {
		if (!onNames) return;
		if (staged) gitIndex = true;
		else if (path === undefined) paths = undefined;
		else if (paths && !addFileScope(paths, path)) paths = undefined;
		namesTimer ??= setTimeout(() => {
			onNames(paths && { paths: [...paths], gitIndex });
			gitIndex = false;
			paths = new Set();
			namesTimer = undefined;
		}, 25);
	};
	const report = (allNames = false) => {
		if (allNames) names();
		clearTimeout(settle);
		settle = setTimeout(onChange, SETTLE_MS);
	};
	// lock files come and go around every git command, including ones that change nothing
	const quiet = (file: string | Buffer | null) => !!file?.toString().endsWith('.lock');
	const changed = (_event: string, file: string | Buffer | null) => {
		if (!quiet(file)) report();
	};
	const refChanged = (_event: string, file: string | Buffer | null) => {
		if (!quiet(file) && (files || !file || concerns(worktree, file.toString()))) report();
	};
	const repoChanged = (_event: string, file: string | Buffer | null) => {
		if (!quiet(file) && (files || !file || file.toString() === 'packed-refs'))
			report(!file || file.toString() === 'config');
	};

	const watchers: FSWatcher[] = [];
	const add = (
		path: string,
		listener: (event: string, file: string | Buffer | null) => void,
		recursive = false
	) => {
		try {
			// a vanished directory is not our problem; the next change elsewhere still reports
			watchers.push(watch(path, { recursive }, listener).on('error', () => report(true)));
		} catch {
			// not there (yet): nothing to watch
		}
	};
	if (files) {
		add(
			worktree.path,
			(event, file) => {
				const path = file?.toString().split(sep).join('/');
				if (
					!path ||
					isAbsolute(path) ||
					path.split('/').some((part) => part === '..' || part === '.' || part === '')
				)
					names();
				else if (basename(path) === '.gitignore') {
					const slash = path.lastIndexOf('/');
					names(slash < 0 ? undefined : path.slice(0, slash));
				} else if (event === 'rename') names(path);
				report();
			},
			true
		);
		add(join(worktree.commonDir, 'info'), (_event, file) => {
			if (!file || file.toString() === 'exclude') report(true);
		});
	}
	add(worktree.adminDir, (event, file) => {
		if (!file) report(true);
		else if (file.toString() === 'index') {
			names(undefined, true);
			report();
		} else changed(event, file);
	});
	add(worktree.commonDir, repoChanged);
	add(join(worktree.commonDir, 'refs'), refChanged, true);

	return () => {
		clearTimeout(settle);
		clearTimeout(namesTimer);
		for (const watcher of watchers) watcher.close();
	};
}

/**
 * Whether a ref (a path below `refs/`) is the worktree's branch, or that branch on a remote.
 * The branch is read when asked: the worktree may have moved to another since.
 */
export function concerns(worktree: Worktree, ref: string): boolean {
	let branch: string | null;
	try {
		branch = branchOf(worktree);
	} catch {
		return true; // can't tell: better once too often
	}
	if (!branch) return false;
	const [kind, ...rest] = ref.split(sep);
	if (kind === 'heads') return rest.join('/') === branch;
	// remotes/<remote>/<branch>
	return kind === 'remotes' && rest.slice(1).join('/') === branch;
}

/**
 * Keeps watching exactly the workspaces the forge asks for: the ones someone is looking at
 * (`open`), files and all, and every other one in use (`background`), only its Git state,
 * so that the sidebar can say at once how each stands. `locate` finds a workspace's
 * worktree (and throws if it has none yet).
 */
export function createWatches(
	locate: (ref: WorktreeRef) => Promise<Worktree>,
	onChange: (worktreeId: string) => void,
	onNames?: (worktreeId: string, changes?: FileChanges) => void
) {
	const wanted: Record<WatchScope, WorktreeRef[]> = { open: [], background: [] };
	const held = new Map<string, WorktreeRef & { worktree: Worktree }>();
	const watching = new Map<string, { stop: () => void; files: boolean }>();

	function apply() {
		const foreground = [...wanted.open, ...held.values()];
		const all = [...foreground, ...wanted.background];
		const open = new Set(foreground.map((ref) => ref.worktreeId));
		const ids = new Set(all.map((ref) => ref.worktreeId));
		for (const [id, { stop, files }] of watching)
			if (!ids.has(id) || files !== open.has(id)) {
				stop();
				watching.delete(id);
			}
		for (const ref of all) {
			const id = ref.worktreeId;
			if (watching.has(id)) continue;
			const files = open.has(id);
			const entry = { files, stop: () => {} };
			watching.set(id, entry);
			const install = (worktree: Worktree) => {
				if (watching.get(id) !== entry) return;
				entry.stop = watchWorktree(
					worktree,
					() => onChange(id),
					files,
					(changes) => onNames?.(id, changes)
				);
			};
			const retained = held.get(id);
			if (retained) install(retained.worktree);
			else
				void locate(ref)
					.then((worktree) => {
						install(worktree);
						if (held.has(id)) onNames?.(id);
					})
					.catch(() => {
						if (watching.get(id) === entry) watching.delete(id);
					});
		}
	}

	return {
		/** Keep file changes observable for as long as the daemon retains this index. */
		hold(ref: WorktreeRef, worktree: Worktree) {
			held.set(ref.worktreeId, { ...ref, worktree });
			apply();
			return () => {
				held.delete(ref.worktreeId);
				apply();
			};
		},
		/** A discovered or retargeted pull changes what this worktree is compared with. */
		targetChanged(id: string) {
			if (wanted.open.some((ref) => ref.worktreeId === id)) onChange(id);
		},
		/** Replaces one set of watched workspaces. */
		set(worktrees: WorktreeRef[], scope: WatchScope = 'open') {
			wanted[scope] = worktrees;
			apply();
		},
		/**
		 * Call when a worktree was created, or came back: a wanted workspace may have been
		 * waiting for it, or still be watching a directory that is no longer the one there.
		 */
		restart(worktreeId: string) {
			onNames?.(worktreeId);
			watching.get(worktreeId)?.stop();
			watching.delete(worktreeId);
			apply();
		},
		stop: () => {
			held.clear();
			wanted.open = [];
			wanted.background = [];
			apply();
		}
	};
}
