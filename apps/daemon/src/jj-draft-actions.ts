// The daemon owns the control store. A caller supplies an action and a description.
// Every path, revision, bookmark and remote comes from the workspace or daemon.
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorktreeRef, DraftAction } from '@geordi/protocol';

type Env = NodeJS.ProcessEnv;
type Commands = {
	location(ref: WorktreeRef): { path: string; branch: string; name: string };
	jj(...args: string[]): Promise<string>;
	forget(name: string): Promise<void>;
	rev(expression: string): Promise<string>;
	withIndex<T>(path: string, use: (env: Env) => Promise<T>): Promise<T>;
	indexed(env: Env, ...args: string[]): Promise<string>;
	diskTree(env: Env, head: string): Promise<string>;
	captureTree(name: string, path: string, head: string, tree: string, env: Env): Promise<string>;
};

export function draftActions(control: string, c: Commands) {
	const records = join(control, '.jj', 'geordi', 'drafts');
	const record = (ref: WorktreeRef) => join(records, c.location(ref).name);
	async function remember(ref: WorktreeRef, head: string) {
		await mkdir(records, { recursive: true });
		const temp = record(ref) + '.next';
		await writeFile(temp, head);
		await rename(temp, record(ref));
	}
	async function act(ref: WorktreeRef, action: DraftAction, message?: string) {
		const { path, name, branch } = c.location(ref);
		if (!lstatSync(path).isDirectory() || !lstatSync(dirname(path)).isDirectory())
			throw new Error('Expected the workspace directory.');
		const head = await c.rev(name + '@');
		if (await c.rev(head + ' & conflicts()'))
			throw new Error('The restacked draft has conflicts. The trial cannot materialize it safely.');
		const previous = await readFile(record(ref), 'utf8');
		return c.withIndex(path, async (env) => {
			const tree = await c.diskTree(env, previous);
			if (action === 'refresh') {
				if (previous !== head) {
					// Two-tree checkout carries unrelated local edits and refuses overlapping edits.
					await c.indexed(env, 'read-tree', '-m', '-u', previous, head);
					await remember(ref, head);
				}
				return { branch, revision: head };
			}
			if (previous !== head) throw new Error('Your draft was restacked. Refresh it first.');
			const headTree = (await c.indexed(env, 'rev-parse', head + '^{tree}')).trim();
			if (action === 'publish') {
				if (tree !== headTree) throw new Error('Snapshot your edits before publishing.');
				const bookmark = await c.rev('present(' + JSON.stringify(branch) + ')');
				if (bookmark !== head) throw new Error('Snapshot this draft before publishing.');
				await c.jj('git', 'push', '--remote', 'origin', '--bookmark', branch);
				return { branch, revision: head };
			}
			if (action !== 'snapshot') throw new Error('Unknown draft action.');
			if (tree !== headTree) {
				const name = 'capture-' + randomUUID();
				const temp = await mkdtemp(join(records, 'capture-'));
				try {
					const capture = join(temp, 'checkout');
					const captured = await c.captureTree(name, capture, head, tree, env);
					await c.jj('restore', '--from', captured, '--into', head);
				} finally {
					try {
						await c.forget(name);
					} finally {
						await rm(temp, { recursive: true, force: true });
					}
				}
			}
			if (message) await c.jj('describe', '-r', name + '@', '-m', message);
			const revision = await c.rev(name + '@');
			await c.jj('bookmark', 'set', branch, '-r', revision);
			await remember(ref, revision);
			return { branch, revision };
		});
	}
	return { remember, act, owns: (ref: WorktreeRef) => existsSync(record(ref)) };
}
