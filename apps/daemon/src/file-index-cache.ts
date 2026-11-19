import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import {
	buildFileIndex,
	FileIndex,
	MAX_FILE_CHANGES,
	refreshFileIndex,
	type FileSource
} from './file-index.ts';
import { gitIn, type Worktree } from './worktree.ts';

const digest = (data: string | Buffer) => createHash('sha256').update(data).digest();

export function checkpointName(root: string, path: string) {
	return join(root, digest(path).toString('hex'));
}

async function stamp(path: string, directory = false) {
	try {
		const s = await stat(path, { bigint: true });
		return [path, s.dev, s.ino, s.birthtimeNs, directory ? '' : s.ctimeNs].join('/');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return path + '/missing';
		throw err;
	}
}

async function worktreeState(tree: Worktree) {
	const defaultIgnore = join(
		process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
		'git',
		'ignore'
	);
	const excludes = (
		await gitIn(tree, 'config', '--path', '--default', defaultIgnore, '--get', 'core.excludesFile')
	).trimEnd();
	const [root, admin, rules, excludesFile, config, gitIndex] = await Promise.all([
		stamp(tree.path, true),
		stamp(tree.adminDir, true),
		stamp(join(tree.commonDir, 'info/exclude')),
		stamp(isAbsolute(excludes) ? excludes : join(tree.path, excludes)),
		gitIn(tree, 'config', '--null', '--list'),
		stamp(join(tree.adminDir, 'index'))
	]);
	return {
		identity: digest(JSON.stringify([root, admin, rules, excludesFile, config])).toString('hex'),
		gitIndex
	};
}

type Checkpoint = {
	identity: string;
	gitIndex?: string;
	cursor?: Buffer;
	paths: string[];
	staging: FileIndex['staging'];
};

async function readCheckpoint(path: string, identity: string) {
	const bytes = await readFile(path);
	const data = bytes.subarray(32);
	if (!digest(data).equals(bytes.subarray(0, 32))) return;
	const saved = deserialize(data) as Checkpoint;
	if (saved.identity === identity) return saved;
}

/** Read the old cursor only after taking the next one. Edits made during enumeration
 * or replay then belong to the next generation as well. */
async function prepare(source: FileSource, temp: string) {
	if (!('worktree' in source))
		return { identity: JSON.stringify([1, source.repoPath, source.revision]) };
	const tree = source.worktree;
	const root = await realpath(tree.path);
	const state = await worktreeState(tree);
	const watcher = (await import('@parcel/watcher')).default;
	// Snapshot formats differ across backends. Use the same one across daemon restarts.
	const backend = process.platform === 'darwin' ? 'fs-events' : 'brute-force';
	const options = { backend } as const;
	const file = join(temp, 'cursor');
	await watcher.writeSnapshot(root, file, options);
	const snapshot = await readFile(file);
	if (!snapshot.length) throw new Error('Empty file watcher snapshot');
	// Portable snapshots enumerate the tree. Parcel's portable diff omits some
	// file-to-directory replacements, so a changed tree needs a fresh Git listing.
	const cursor = backend === 'brute-force' ? digest(snapshot) : snapshot;

	async function changedPaths(previous?: Buffer) {
		if (!previous?.length) return;
		if (backend === 'brute-force') return cursor.equals(previous) ? [] : undefined;
		await writeFile(file, previous);
		const scopes = new Set<string>();
		for (const event of await watcher.getEventsSince(root, file, options)) {
			let name = relative(root, event.path).split(sep).join('/');
			if (basename(name) === '.gitignore') name = dirname(name);
			if (!name || name === '.' || name === '..' || name.startsWith('../') || isAbsolute(name))
				return;
			scopes.add(name);
			if (scopes.size > MAX_FILE_CHANGES) return;
		}
		return [...scopes];
	}
	return {
		identity: JSON.stringify([1, backend, state.identity]),
		gitIndex: state.gitIndex,
		cursor,
		changedPaths
	};
}

export async function loadFileIndex(
	source: FileSource,
	cacheDir: string | undefined,
	restore: boolean
) {
	if (
		!cacheDir ||
		('revision' in source && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.revision))
	)
		return buildFileIndex(source);
	const path = checkpointName(
		cacheDir,
		'worktree' in source ? source.worktree.path : source.repoPath
	);
	let temp: string | undefined;
	try {
		let current: Awaited<ReturnType<typeof prepare>>;
		try {
			const pending = join(cacheDir, 'pending');
			await mkdir(pending, { recursive: true, mode: 0o700 });
			temp = await mkdtemp(join(pending, 'write-'));
			current = await prepare(source, temp);
		} catch {
			return await buildFileIndex(source);
		}
		const saved = restore && (await readCheckpoint(path, current.identity).catch(() => undefined));
		let index: FileIndex | undefined;
		if (saved) {
			const paths = current.changedPaths
				? await current.changedPaths(saved.cursor).catch(() => undefined)
				: [];
			if (paths) {
				const previous = new FileIndex('worktree' in source);
				for (const name of saved.paths) previous.add(name);
				previous.staging = saved.staging;
				const gitIndex = current.gitIndex !== saved.gitIndex;
				if (!paths.length && !gitIndex) return previous;
				// A saved Git base can disappear during an offline history rewrite.
				index = await refreshFileIndex(previous, source, { paths, gitIndex }).catch(
					() => undefined
				);
			}
		}
		index ??= await buildFileIndex(source);
		try {
			const data = serialize({
				identity: current.identity,
				gitIndex: current.gitIndex,
				cursor: current.cursor,
				paths: index.checkpointPaths(),
				staging: index.staging
			} satisfies Checkpoint);
			const output = join(temp, 'index');
			await writeFile(output, Buffer.concat([digest(data), data]), { mode: 0o600 });
			await rename(output, path);
		} catch {
			// A read-only or full cache still permits in-memory searches.
		}
		return index;
	} finally {
		if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {});
	}
}
