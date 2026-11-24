// Experimental native workspace backend for one explicitly selected repository.
import { execFile } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
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

const run = promisify(execFile);

export async function nativeWorkspaces(root: string, source?: string, control?: string) {
	if (!source && !control) return;
	if (!source || !control) throw new Error('Set both GEORDI_JJ_SOURCE and GEORDI_JJ_CONTROL');
	if (existsSync(join(control, '.git')))
		throw new Error('Use a non-colocated jj control workspace');
	const jj = async (...args: string[]) =>
		(
			await run('jj', ['--config', 'git.colocate=false', ...args], {
				cwd: control,
				timeout: 120_000
			})
		).stdout.trim();
	const store = await jj('git', 'root');
	const rev = (expression: string) =>
		jj('--ignore-working-copy', 'log', '--no-graph', '-r', expression, '-T', 'commit_id');
	const remoteBookmark = (name: string) =>
		'remote_bookmarks(exact:' + JSON.stringify(name) + ', exact:"origin")';
	const object = (...args: string[]) => git(store, ['--git-dir', store, ...args]);
	function location(ref: WorktreeRef) {
		const path = worktreePath(root, ref);
		if (
			!/^[\da-f-]{36}$/i.test(ref.worktreeId) ||
			dirname(dirname(resolve(path))) !== resolve(root)
		)
			throw new Error('Invalid native workspace location');
		return { path, branch: 'geordi/' + ref.worktreeId.slice(0, 8), name: 'ws-' + ref.worktreeId };
	}
	async function prepare(ref: WorktreeRef, restore = false) {
		const { path, branch, name } = location(ref);
		if (!existsSync(path)) {
			await mkdir(dirname(path), { recursive: true });
			if (existsSync(path + '.archived')) await rename(path + '.archived', path);
			else {
				if (restore) throw new Error('Archived native workspace is missing');
				if (ref.base) branchRef(ref.base);
				const base = ref.base ? JSON.stringify(ref.base) : 'trunk()';
				await jj('workspace', 'add', '--name', name, '-r', base, path);
			}
		}
		if (
			!lstatSync(path).isDirectory() ||
			!lstatSync(join(path, '.jj')).isDirectory() ||
			existsSync(join(path, '.git'))
		)
			throw new Error('Expected a native Jujutsu workspace');
		ensureContext(path);
		return { path, branch };
	}
	async function range(ref: WorktreeRef, target?: string) {
		const { path, name } = location(ref);
		if (!existsSync(path)) throw new Error(NO_WORKTREE);
		const head = await rev(name + '@');
		const base = target || ref.base;
		if (base) branchRef(base);
		const publishedBase = target && (await rev(remoteBookmark(target)));
		const comparison = publishedBase || (await rev(base ? JSON.stringify(base) : 'trunk()'));
		const fork = (await object('merge-base', head, comparison)).trim();
		const diff = (format: string) =>
			object(
				'diff',
				'--no-ext-diff',
				'--no-textconv',
				'--ignore-submodules=all',
				'-M',
				format,
				'-z',
				fork,
				head
			);
		const [names, counts] = await Promise.all([diff('--name-status'), diff('--numstat')]);
		return { head, fork, files: parseFileChanges(names.split('\0'), counts.split('\0')) };
	}
	async function status(ref: WorktreeRef, target?: string): Promise<Changes> {
		const { head, fork, files } = await range(ref, target);
		const { branch } = location(ref);
		const published = await rev(remoteBookmark(branch));
		return {
			branch,
			comparisonTarget: target ?? ref.base,
			files,
			uncommitted: 0,
			unpushed: published
				? Number(await object('rev-list', '--count', published + '..' + head))
				: null,
			unmerged: fork !== head,
			landed: false
		};
	}
	async function versions(ref: WorktreeRef, path: string, target?: string): Promise<FileVersions> {
		const { head, fork, files } = await range(ref, target);
		const entry = files.find((f) => f.path === path);
		if (!entry) return { unavailable: 'This file has no changes any more.' };
		async function content(id: string, file: string) {
			const spec = id + ':' + file;
			if (Number(await object('cat-file', '-s', spec)) > MAX_IMAGE_BYTES)
				throw new Error('File is too large');
			const raw = await git(store, ['--git-dir', store, 'cat-file', 'blob', spec], {
				encoding: 'latin1'
			});
			const value = fileContent(Buffer.from(raw, 'latin1'));
			if (value === null) throw new Error('Unsupported file');
			return value;
		}
		try {
			return {
				old: entry.status === 'added' ? null : await content(fork, entry.from ?? path),
				new: entry.status === 'deleted' ? null : await content(head, path)
			};
		} catch {
			return { unavailable: 'Could not read this file version.' };
		}
	}
	return {
		matches: (ref: { repoPath: string }) => ref.repoPath === source,
		store,
		prepare,
		location,
		status,
		versions,
		async archive(ref: WorktreeRef) {
			const { path, branch } = location(ref);
			// Retain unsnapshotted files and the working-copy metadata together.
			if (existsSync(path)) await rename(path, path + '.archived');
			else if (!existsSync(path + '.archived')) throw new Error(NO_WORKTREE);
			return { branch };
		}
	};
}

export type NativeWorkspaces = NonNullable<Awaited<ReturnType<typeof nativeWorkspaces>>>;
