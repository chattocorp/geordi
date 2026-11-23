import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { WatchScope, WorktreeRef } from '@geordi/protocol';
import { addFileScope, type FileChanges } from './file-index.ts';
import type { WatchEvent, WatchRequest } from './watch-worker.ts';
import { branchOf, type Worktree } from './worktree.ts';

/** Changes come in bursts (a save, a checkout, an install); report each burst once. */
const SETTLE_MS = 250;

const program = new URL(
	import.meta.url.endsWith('.ts') ? './watch-worker.ts' : './watch-worker.js',
	import.meta.url
);

type Subscription = {
	dir: string;
	recursive: boolean;
	/** What happened, by name relative to `dir` in `/` form; `null` if the watcher can't say. */
	onEvent: (event: string, name: string | null) => void;
	onError: () => void;
};
const subscriptions = new Map<number, Subscription>();
let worker: Worker | undefined;
let nextId = 0;

/** The watcher thread, started when first needed, and again (with every watch) if it ended. */
function thread(): Worker {
	if (worker) return worker;
	const started = new Worker(program);
	started.unref();
	started.on('message', (message: WatchEvent) => {
		const subscription = subscriptions.get(message.id);
		if (!subscription) return;
		if ('error' in message) return subscription.onError();
		const { file } = message;
		const name = file === null ? null : file.split(sep).join('/');
		subscription.onEvent(
			message.event,
			name &&
				!isAbsolute(name) &&
				!name.split('/').some((part) => part === '..' || part === '.' || part === '')
				? name
				: null
		);
	});
	const since = Date.now();
	const lost = (error?: Error) => {
		if (worker !== started) return;
		worker = undefined;
		console.error(`[watch] the watcher thread ended: ${error?.message ?? 'it exited'}`);
		const restart = () => {
			if (worker || subscriptions.size === 0) return;
			const again = thread();
			for (const [id, { dir, recursive, onError }] of subscriptions) {
				again.postMessage({ type: 'watch', id, dir, recursive } satisfies WatchRequest);
				onError(); // what happened in the meantime is not known
			}
		};
		// one that ends as soon as it starts is not started again and again
		setTimeout(restart, Date.now() - since < 5000 ? 5000 : 0).unref();
	};
	started.on('error', lost);
	started.on('exit', () => lost());
	worker = started;
	return started;
}

/**
 * Watches a directory (and, `recursive`, everything below it) until the returned function
 * is called. In a thread of its own (`watch-worker.ts`): on macOS, starting and stopping a
 * watcher holds up the thread that does it, for a tenth of a second or more (ADR-014).
 */
function subscribe(
	dir: string,
	recursive: boolean,
	onEvent: Subscription['onEvent'],
	onError: () => void
): () => void {
	const id = ++nextId;
	subscriptions.set(id, { dir, recursive, onEvent, onError });
	thread().postMessage({ type: 'watch', id, dir, recursive } satisfies WatchRequest);
	return () => {
		if (!subscriptions.delete(id)) return;
		worker?.postMessage({ type: 'unwatch', id } satisfies WatchRequest);
	};
}

/** A worktree being watched, and what it is told. */
export type Member = {
	worktree: Worktree;
	/** Its administrative directory below the repository's (`worktrees/<name>`). */
	admin: string;
	/** Whether someone has it open: then its files count, and all of the repository's Git state. */
	files: boolean;
	report: (allNames?: boolean) => void;
	names: (path?: string, staged?: boolean) => void;
};

/**
 * What changes in a repository's Git directory, for the worktrees being watched in it.
 *
 * - `worktrees/<name>/…`: that worktree's own state (what it has checked out, its index).
 * - `refs/…`: its branch, here and on the remotes; every branch for one that is open (a
 *   commit or a fetch elsewhere is none of the business of one nobody has open).
 * - `packed-refs` (branches too), and for one that is open the rest of the directory's own
 *   files (`config` among them) and `info/exclude`, which decides which of its files count.
 */
export function route(members: Iterable<Member>, name: string) {
	if (name.endsWith('.lock')) return; // lock files come and go around every git command
	const [top, ...rest] = name.split('/');
	for (const member of members) {
		if (top === 'worktrees') {
			if (name === member.admin) member.report(true);
			else if (name === `${member.admin}/index`) {
				member.names(undefined, true);
				member.report();
			} else if (name.startsWith(`${member.admin}/`)) member.report();
		} else if (top === 'refs') {
			if (member.files || concerns(member.worktree, rest.join(sep))) member.report();
		} else if (top === 'info') {
			if (member.files && name === 'info/exclude') member.report(true);
		} else if (rest.length === 0) {
			if (member.files || name === 'packed-refs') member.report(name === 'config');
		}
	}
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
 *
 * `onChange` is called when anything changes that a workspace's changes or pull request
 * depend on: its files (if open), what it has checked out and staged, and its branches
 * (commits, and pushes, which move the remote-tracking branches). `onNames` when its files'
 * names may have changed, with the paths concerned where they are known.
 *
 * A repository's Git directory is watched once, for all of its worktrees being watched; an
 * open worktree's files on top of that. A worktree that is opened or let go of only starts
 * or stops the watch on its files.
 */
export function createWatches(
	locate: (ref: WorktreeRef) => Promise<Worktree>,
	onChange: (worktreeId: string) => void,
	onNames?: (worktreeId: string, changes?: FileChanges) => void
) {
	const wanted: Record<WatchScope, WorktreeRef[]> = { open: [], background: [] };
	const held = new Map<string, WorktreeRef & { worktree: Worktree }>();

	/** The repositories' Git directories being watched, by path. */
	const repos = new Map<string, { members: Set<Member>; stop: () => void }>();

	/**
	 * Enters a worktree into the watch on its repository's Git directory: the directory's own
	 * files, its branches, what it knows of each worktree, and `info/` (never `objects/`, which
	 * every commit and fetch writes to, and which no state depends on).
	 */
	function enter(member: Member) {
		const dir = member.worktree.commonDir;
		let repo = repos.get(dir);
		if (!repo) {
			const members = new Set<Member>();
			const lost = () => {
				for (const member of members) member.report(true);
			};
			const part = (below: string, recursive: boolean) =>
				subscribe(
					below ? join(dir, below) : dir,
					recursive,
					(_event, name) =>
						name === null ? lost() : route(members, below ? `${below}/${name}` : name),
					lost
				);
			const stops = [
				part('', false),
				part('refs', true),
				part('worktrees', true),
				part('info', false)
			];
			repo = { members, stop: () => stops.forEach((stop) => stop()) };
			repos.set(dir, repo);
		}
		repo.members.add(member);
		return () => {
			repo.members.delete(member);
			if (repo.members.size === 0 && repos.get(dir) === repo) {
				repo.stop();
				repos.delete(dir);
			}
		};
	}

	/** Watches one worktree. Its files are watched while `files`; `open` changes that. */
	function follow(id: string, worktree: Worktree, files: boolean) {
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
				onNames(id, paths && { paths: [...paths], gitIndex });
				gitIndex = false;
				paths = new Set();
				namesTimer = undefined;
			}, 25);
		};
		const report = (allNames = false) => {
			if (allNames) names();
			clearTimeout(settle);
			settle = setTimeout(() => onChange(id), SETTLE_MS);
		};
		const member: Member = {
			worktree,
			admin: relative(worktree.commonDir, worktree.adminDir).split(sep).join('/'),
			files: false,
			report,
			names
		};

		const fileEvent = (event: string, name: string | null) => {
			if (name === null) names();
			else if (basename(name) === '.gitignore') {
				const parent = dirname(name);
				names(parent === '.' ? undefined : parent);
			} else if (event === 'rename') names(name); // created, deleted or moved
			report();
		};
		let stopFiles: (() => void) | undefined;
		const open = (files: boolean) => {
			member.files = files;
			if (files) stopFiles ??= subscribe(worktree.path, true, fileEvent, () => report(true));
			else {
				stopFiles?.();
				stopFiles = undefined;
			}
		};

		const leave = enter(member);
		open(files);
		return {
			open,
			stop() {
				clearTimeout(settle);
				clearTimeout(namesTimer);
				open(false);
				leave();
			}
		};
	}

	type Watching = { files: boolean; follower?: ReturnType<typeof follow> };
	const watching = new Map<string, Watching>();

	function apply() {
		const foreground = [...wanted.open, ...held.values()];
		const all = [...foreground, ...wanted.background];
		const open = new Set(foreground.map((ref) => ref.worktreeId));
		const ids = new Set(all.map((ref) => ref.worktreeId));
		for (const [id, entry] of watching)
			if (!ids.has(id)) {
				entry.follower?.stop();
				watching.delete(id);
			} else if (entry.files !== open.has(id)) {
				entry.files = open.has(id);
				entry.follower?.open(entry.files);
			}
		for (const ref of all) {
			const id = ref.worktreeId;
			if (watching.has(id)) continue;
			const entry: Watching = { files: open.has(id) };
			watching.set(id, entry);
			const install = (worktree: Worktree) => {
				if (watching.get(id) !== entry) return;
				entry.follower = follow(id, worktree, entry.files);
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
			watching.get(worktreeId)?.follower?.stop();
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
