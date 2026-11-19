import { createHash } from 'node:crypto';
import {
	mkdir,
	mkdtemp,
	opendir,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	writeFile
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import {
	buildFileIndex,
	FileIndex,
	addFileScope,
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

async function gitExcludesFile(tree: Worktree) {
	const defaultIgnore = join(
		process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
		'git',
		'ignore'
	);
	const excludes = (
		await gitIn(tree, 'config', '--path', '--default', defaultIgnore, '--get', 'core.excludesFile')
	).trimEnd();
	return isAbsolute(excludes) ? excludes : join(tree.path, excludes);
}

export async function readExcludesState(tree: Worktree, knownPath?: string) {
	const path = knownPath ?? (await gitExcludesFile(tree));
	return { path, stamp: await stamp(path) };
}

async function worktreeState(tree: Worktree, excludesStamp: string) {
	const [root, admin, rules, config, gitIndex] = await Promise.all([
		stamp(tree.path, true),
		stamp(tree.adminDir, true),
		stamp(join(tree.commonDir, 'info/exclude')),
		gitIn(tree, 'config', '--null', '--list'),
		stamp(join(tree.adminDir, 'index'))
	]);
	return {
		identity: digest(JSON.stringify([root, admin, rules, excludesStamp, config])).toString('hex'),
		gitIndex
	};
}

/** Bound disk use for repositories or worktrees removed outside Geordi. */
export async function pruneFileCheckpoints(cacheDir: string) {
	const expired = Date.now() - 30 * 24 * 60 * 60 * 1000;
	for await (const entry of await opendir(cacheDir)) {
		if (!entry.isFile() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
		const path = join(cacheDir, entry.name);
		const file = await stat(path);
		if (Math.max(file.atimeMs, file.mtimeMs) < expired) await rm(path, { force: true });
	}
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
async function prepare(source: FileSource, temp: string, excludesStamp?: string) {
	if (!('worktree' in source))
		return { identity: JSON.stringify([1, source.repoPath, source.revision]) };
	const tree = source.worktree;
	const root = await realpath(tree.path);
	if (excludesStamp === undefined) throw new Error('Could not check Git ignore rules');
	const state = await worktreeState(tree, excludesStamp);
	const watcher = (await import('@parcel/watcher')).default;
	const options = { backend: 'fs-events' } as const;
	const file = join(temp, 'cursor');
	await watcher.writeSnapshot(root, file, options);
	const cursor = await readFile(file);
	if (!cursor.length) throw new Error('Empty file watcher snapshot');

	async function changedPaths(previous?: Buffer) {
		if (!previous?.length) return;
		await writeFile(file, previous);
		const scopes = new Set<string>();
		for (const event of await watcher.getEventsSince(root, file, options)) {
			let name = relative(root, event.path).split(sep).join('/');
			if (basename(name) === '.gitignore') name = dirname(name);
			if (!name || name === '.' || name === '..' || name.startsWith('../') || isAbsolute(name))
				return;
			if (!addFileScope(scopes, name)) return;
		}
		return [...scopes];
	}
	return {
		identity: JSON.stringify([2, options.backend, state.identity]),
		gitIndex: state.gitIndex,
		cursor,
		changedPaths
	};
}

export async function loadFileIndex(
	source: FileSource,
	cacheDir: string | undefined,
	restore: boolean,
	excludesStamp?: string
) {
	if (
		!cacheDir ||
		('worktree' in source && process.platform !== 'darwin') ||
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
			current = await prepare(source, temp, excludesStamp);
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
