// Experimental native workspace backend for one explicitly selected repository.
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
	MAX_IMAGE_BYTES,
	NO_WORKTREE,
	type Changes,
	type FileVersions,
	type WorktreeRef
} from '@geordi/protocol';
import { git } from './git.ts';
import { fileContent, parseFileChanges } from './changes.ts';
import { branchRef, ensureContext, worktreePath } from './worktree.ts';

import { nativeWatches } from './jj-watch.ts';

const run = promisify(execFile);

type Comparison = {
	head: string;
	fork: string;
	files: Changes['files'];
	tree: string;
	env: NodeJS.ProcessEnv;
	dirty: number;
};

export async function nativeWorkspaces(
	root: string,
	source?: string,
	control?: string,
	changed?: (id: string) => void
) {
	if (!source && !control) return;
	if (!source || !control) throw new Error('Set both GEORDI_JJ_SOURCE and GEORDI_JJ_CONTROL');
	if (existsSync(join(control, '.git')))
		throw new Error('Use a non-colocated jj control workspace');
	const runJj = async (cwd: string, ...args: string[]) =>
		(
			await run('jj', ['--config', 'git.colocate=false', ...args], {
				cwd,
				timeout: 120_000
			})
		).stdout.trim();
	const jj = (...args: string[]) => runJj(control, ...args);
	const store = await jj('git', 'root');
	const rev = (expression: string) =>
		jj('--ignore-working-copy', 'log', '--no-graph', '-r', expression, '-T', 'commit_id');
	const remoteBookmark = (name: string) =>
		'remote_bookmarks(exact:' + JSON.stringify(name) + ', exact:"origin")';
	async function baseRevision(base?: string) {
		if (!base) return rev('trunk()');
		branchRef(base);
		const revision =
			(await rev('present(' + JSON.stringify(base) + ')')) || (await rev(remoteBookmark(base)));
		if (!revision) throw new Error('Unknown base branch: ' + base);
		return revision;
	}
	const object = (...args: string[]) => git(store, ['--git-dir', store, ...args]);
	const publications = join(control, '.jj', 'geordi', 'publications');
	function location(ref: WorktreeRef) {
		const path = worktreePath(root, ref);
		if (
			!/^[\da-f-]{36}$/i.test(ref.worktreeId) ||
			dirname(dirname(resolve(path))) !== resolve(root)
		)
			throw new Error('Invalid native workspace location');
		// A migrated worktree can already publish under a person-chosen branch.
		const publication = join(publications, ref.worktreeId);
		const branch = existsSync(publication)
			? readFileSync(publication, 'utf8').trim()
			: 'geordi/' + ref.worktreeId.slice(0, 8);
		branchRef(branch);
		return { path, branch, name: 'ws-' + ref.worktreeId };
	}
	const watches = changed && nativeWatches((ref) => location(ref).path, changed);
	let open: WorktreeRef[] = [];
	function watch(refs: WorktreeRef[]) {
		open = refs;
		watches?.set(refs.filter((ref) => existsSync(location(ref).path)));
	}
	// Keep the index, attributes and object writes independent of the checkout. No
	// command here discovers Git or jj configuration in an agent-writable directory.
	const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
	const emptyTree = (await object('hash-object', '-t', 'tree', nullFile)).trim();
	async function withIndex<T>(path: string, use: (env: NodeJS.ProcessEnv) => Promise<T>) {
		const tmp = await mkdtemp(join(root, '.jj-index-'));
		try {
			const objects = join(tmp, 'objects');
			await mkdir(objects);
			return await use({
				...process.env,
				GIT_DIR: store,
				GIT_WORK_TREE: path,
				GIT_INDEX_FILE: join(tmp, 'index'),
				GIT_OBJECT_DIRECTORY: objects,
				GIT_ALTERNATE_OBJECT_DIRECTORIES: join(store, 'objects'),
				GIT_CONFIG_GLOBAL: nullFile,
				GIT_CONFIG_NOSYSTEM: '1',
				GIT_ATTR_NOSYSTEM: '1',
				GIT_ATTR_SOURCE: emptyTree
			});
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	}
	const indexed = (env: NodeJS.ProcessEnv, ...args: string[]) =>
		git(store, ['-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', ...args], {
			env,
			timeout: 120_000
		});
	async function diskTree(env: NodeJS.ProcessEnv, head: string) {
		await indexed(env, 'read-tree', head);
		await indexed(env, 'add', '-A', '--', '.', ':(top,exclude).jj');
		return (await indexed(env, 'write-tree')).trim();
	}
	const checkpoint = (name: string) => 'archive-' + name;
	const saved = (name: string) => rev('present(' + checkpoint(name) + '@)');
	async function forget(name: string) {
		if (await rev('present(' + name + '@)')) await jj('workspace', 'forget', name);
	}
	// Apply an overlay to a fresh native checkout. Its real jj working-copy revision
	// stays on the original change; the overlay is still an ordinary unsnapshotted edit.
	async function materialize(path: string, head: string, tree: string, env: NodeJS.ProcessEnv) {
		const checkout = { ...env, GIT_WORK_TREE: path };
		await indexed(checkout, 'read-tree', head);
		await indexed(checkout, 'read-tree', '--reset', '-u', tree);
	}
	async function archive(ref: WorktreeRef) {
		const { path, name, branch } = location(ref);
		const removing = path + '.removing';
		const discarded = path + '.discarded';
		if (existsSync(path)) {
			if (!lstatSync(path).isDirectory()) throw new Error('Invalid native checkout');
			await rename(path, removing);
		}
		if (existsSync(removing)) {
			// Snapshot from the detached directory. The published branch never moves.
			const captureName = checkpoint(name);
			const capture = join(root, '.' + captureName);
			try {
				await forget(captureName);
				await rm(capture, { recursive: true, force: true });
				const head = await rev(name + '@');
				await withIndex(removing, async (env) => {
					const tree = await diskTree(env, head);
					await jj('workspace', 'add', '--name', captureName, '-r', head, capture);
					await materialize(capture, head, tree, env);
					await runJj(capture, '--config', 'snapshot.max-new-file-size=0', 'util', 'snapshot');
					const snapshot = await rev(captureName + '@');
					if ((await object('rev-parse', snapshot + '^{tree}')).trim() !== tree)
						throw new Error('Jujutsu could not capture every file.');
					if ((await rev(name + '@')) !== head || (await diskTree(env, head)) !== tree)
						throw new Error('The workspace changed during archive. Retry.');
				});
				await rename(removing, discarded);
			} catch (error) {
				await rename(removing, path);
				await forget(captureName);
				throw error;
			} finally {
				await rm(capture, { recursive: true, force: true });
			}
		} else if (!(await saved(name))) throw new Error(NO_WORKTREE);
		await forget(name);
		await rm(discarded, { recursive: true, force: true });
		watches?.stop(ref.worktreeId);
		return { branch };
	}
	async function prepare(ref: WorktreeRef, restore = false) {
		const { path, branch, name } = location(ref);
		const restoring = path + '.restoring';
		if (existsSync(path + '.removing') && !existsSync(path)) await rename(path + '.removing', path);
		if (!existsSync(path) || existsSync(restoring)) {
			await mkdir(dirname(path), { recursive: true });
			if (existsSync(path + '.archived')) await rename(path + '.archived', path);
			else {
				const snapshot = await saved(name);
				if (snapshot) {
					// Until this marker is cleared Geordi has never handed the checkout
					// back to an agent. A restart can repeat materialization from scratch.
					await writeFile(restoring, snapshot);
					await forget(name);
					await rm(path + '.discarded', { recursive: true, force: true });
					await rm(path, { recursive: true, force: true });
					const head = await rev(snapshot + '-');
					await jj('workspace', 'add', '--name', name, '-r', head, path);
					if (await rev(head + ' ~ immutable()')) await runJj(path, 'edit', head);
					await withIndex(path, async (env) => {
						await materialize(path, head, snapshot, env);
						const tree = await diskTree(env, head);
						if (tree !== (await object('rev-parse', snapshot + '^{tree}')).trim())
							throw new Error('The restored files differ from the archive.');
					});
					await rm(restoring);
					await forget(checkpoint(name));
					await rm(join(root, '.' + checkpoint(name)), { recursive: true, force: true });
				} else {
					if (restore || existsSync(restoring))
						throw new Error('Archived native workspace is missing');
					await jj('workspace', 'add', '--name', name, '-r', await baseRevision(ref.base), path);
				}
			}
		}
		if (
			!lstatSync(path).isDirectory() ||
			!lstatSync(join(path, '.jj')).isDirectory() ||
			existsSync(join(path, '.git'))
		)
			throw new Error('Expected a native Jujutsu workspace');
		ensureContext(path);
		watch(open);
		return { path, branch };
	}
	async function range<T>(
		ref: WorktreeRef,
		target: string | undefined,
		use: (comparison: Comparison) => Promise<T>
	) {
		const { path, name } = location(ref);
		if (!existsSync(path)) throw new Error(NO_WORKTREE);
		const head = await rev(name + '@');
		const base = target || ref.base;
		if (base) branchRef(base);
		const publishedBase = target && (await rev(remoteBookmark(target)));
		const comparison = publishedBase || (await baseRevision(base));
		const fork = (await object('merge-base', head, comparison)).trim();
		return withIndex(path, async (env) => {
			const tree = await diskTree(env, head);
			const diff = (format: string, base: string) =>
				indexed(
					env,
					'diff',
					'--no-ext-diff',
					'--no-textconv',
					'--ignore-submodules=all',
					'-M',
					format,
					'-z',
					base,
					tree
				);
			const [names, counts, dirty] = await Promise.all([
				diff('--name-status', fork),
				diff('--numstat', fork),
				diff('--name-only', head)
			]);
			return use({
				head,
				fork,
				files: parseFileChanges(names.split('\0'), counts.split('\0')),
				tree,
				env,
				dirty: dirty.split('\0').length - 1
			});
		});
	}
	async function status(ref: WorktreeRef, target?: string): Promise<Changes> {
		return range(ref, target, async ({ head, fork, files, dirty }) => {
			const { branch } = location(ref);
			const published = await rev(remoteBookmark(branch));
			return {
				branch,
				comparisonTarget: target ?? ref.base,
				files,
				uncommitted: dirty,
				unpushed: published
					? Number(await object('rev-list', '--count', published + '..' + head))
					: null,
				unmerged: fork !== head,
				landed: false
			};
		});
	}
	async function versions(ref: WorktreeRef, path: string, target?: string): Promise<FileVersions> {
		return range(ref, target, async ({ fork, files, tree, env }): Promise<FileVersions> => {
			const entry = files.find((f) => f.path === path);
			if (!entry) return { unavailable: 'This file has no changes any more.' };
			async function content(id: string, file: string) {
				const spec = id + ':' + file;
				if (Number(await git(store, ['cat-file', '-s', spec], { env })) > MAX_IMAGE_BYTES)
					throw new Error('File is too large');
				const raw = await git(store, ['--git-dir', store, 'cat-file', 'blob', spec], {
					env,
					encoding: 'latin1'
				});
				const value = fileContent(Buffer.from(raw, 'latin1'));
				if (value === null) throw new Error('Unsupported file');
				return value;
			}
			try {
				return {
					old: entry.status === 'added' ? null : await content(fork, entry.from ?? path),
					new: entry.status === 'deleted' ? null : await content(tree, path)
				};
			} catch {
				return { unavailable: 'Could not read this file version.' };
			}
		});
	}
	return {
		matches: (ref: { repoPath: string }) => ref.repoPath === source,
		store,
		prepare,
		location,
		status,
		versions,
		archive,
		watch
	};
}

export type NativeWorkspaces = NonNullable<Awaited<ReturnType<typeof nativeWorkspaces>>>;
