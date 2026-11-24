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
	checkoutState(ref: WorktreeRef, action: 'inspect' | 'ack', head: string): Promise<string>;
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
	// The disk baseline is Geordi's last materialization. jj status may have
	// advanced the checkout itself in the meantime. In that case the live files
	// are already based on head, including any newer edits.
	async function refresh(ref: WorktreeRef, head: string) {
		const previous = await readFile(record(ref), 'utf8');
		const local = await c.checkoutState(ref, 'inspect', head);
		if (local !== head && previous !== head) {
			if (await c.rev(head + ' & conflicts()'))
				throw new Error('The restacked draft has conflicts.');
			await c.withIndex(c.location(ref).path, async (env) => {
				await c.diskTree(env, previous);
				await c.indexed(env, 'read-tree', '-m', '-u', previous, head);
			});
		}
		if (local !== head) await c.checkoutState(ref, 'ack', head);
		if (previous !== head) await remember(ref, head);
	}

	async function refreshDependents(ref: WorktreeRef, revision: string) {
		// A revision can restack several open descendants. The workspace names are
		// matched against daemon-owned records before touching any checkout.
		const rows = await c.jj(
			'--ignore-working-copy',
			'workspace',
			'list',
			'-T',
			'name ++ " " ++ target.commit_id() ++ "\n"'
		);
		const failures: string[] = [];
		for (const row of rows.split('\n')) {
			const match = /^ws-([a-f0-9-]{36}) ([a-f0-9]{40})$/.exec(row);
			if (!match || match[1] === ref.worktreeId) continue;
			const other = { ...ref, worktreeId: match[1] };
			if (!existsSync(record(other)) || !existsSync(c.location(other).path)) continue;
			if ((await readFile(record(other), 'utf8')) === match[2]) continue;
			if (await c.rev(match[2] + ' & descendants(' + revision + ')')) {
				try {
					await refresh(other, match[2]);
				} catch (error) {
					failures.push(match[1] + ': ' + (error instanceof Error ? error.message : String(error)));
				}
			}
		}
		if (failures.length)
			throw new Error(
				'Saved draft ' +
					revision +
					'. Could not refresh dependent workspaces:\n' +
					failures.join('\n')
			);
	}

	async function act(ref: WorktreeRef, action: DraftAction, message?: string) {
		const { path, name, branch } = c.location(ref);
		if (!lstatSync(path).isDirectory() || !lstatSync(dirname(path)).isDirectory())
			throw new Error('Expected the workspace directory.');
		const head = await c.rev(name + '@');
		if (await c.rev(head + ' & conflicts()'))
			throw new Error('The restacked draft has conflicts. The trial cannot materialize it safely.');
		await refresh(ref, head);
		if (action === 'refresh') return { branch, revision: head };
		return c.withIndex(path, async (env) => {
			const tree = await c.diskTree(env, head);
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
			await c.checkoutState(ref, 'ack', revision);
			await remember(ref, revision);
			await refreshDependents(ref, revision);
			return { branch, revision };
		});
	}
	return { remember, act, owns: (ref: WorktreeRef) => existsSync(record(ref)) };
}
