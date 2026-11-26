import { execFileSync } from 'node:child_process';
import {
	closeSync,
	existsSync,
	openSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	utimesSync
} from 'node:fs';
import { join } from 'node:path';
import { parseFileChanges, SAFE_DIFF_OPTIONS } from './changes.ts';
import { gitEnv, type Worktree } from './worktree.ts';
import type { TurnDiff } from '@geordi/protocol';

const MAX_PATCH = 256 * 1024;

/** Called in the detached host. Capture each boundary before the CLI can receive its next prompt. */
export function startTurnDiff(worktree: Worktree, sessionDir: string, workspaceId: string) {
	const dir = mkdtempSync(join(sessionDir, 'turn-'));
	const index = join(dir, 'index');
	const objects = join(dir, 'objects');
	const env = {
		...gitEnv(worktree),
		GIT_INDEX_FILE: index,
		GIT_OBJECT_DIRECTORY: objects,
		GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(join(worktree.commonDir, 'objects'))
	};
	const run = (args: string[], input?: string, maxBuffer = 16 * 1024 * 1024) =>
		execFileSync(
			'git',
			[
				'--literal-pathspecs',
				'-c',
				'core.fsmonitor=false',
				'-c',
				'core.hooksPath=' + dir,
				'-c',
				'core.quotePath=false',
				'--no-pager',
				...args
			],
			{
				cwd: worktree.path,
				env,
				input,
				encoding: 'utf8',
				maxBuffer,
				timeout: 10_000,
				stdio: ['pipe', 'pipe', 'pipe']
			}
		);

	function tree() {
		const original = join(worktree.adminDir, 'index');
		copyFileSync(original, index);
		// Git trusts an entry's file to be unchanged when its size and modification time
		// match, unless the entry is as recent as the index itself: then it reads the file.
		// A copy made now would lose that, and miss an edit of the same size in the same
		// second; so the copy is as old as the index (in whole seconds: never newer).
		const at = Math.floor(statSync(original).mtimeMs / 1000);
		utimesSync(index, at, at);
		const tracked = run(['diff-files', '--name-only', '-z', ...SAFE_DIFF_OPTIONS]);
		const untracked = run(['ls-files', '--others', '--exclude-standard', '-z']);
		// Embedded repositories are listed as directories. Never descend into them.
		const paths = (tracked + untracked).split('\0').filter((path) => path && !path.endsWith('/'));
		if (paths.length)
			run(['update-index', '--add', '--remove', '-z', '--stdin'], paths.join('\0') + '\0');
		return run(['write-tree']).trim();
	}

	/** A patch above the event limit leaves the summary and Git versions available. */
	function readPatch(diff: string[]) {
		try {
			return run(
				[
					'-c',
					'diff.suppressBlankEmpty=false',
					...diff,
					'--unified=3',
					'--no-color',
					'--src-prefix=a/',
					'--dst-prefix=b/'
				],
				undefined,
				MAX_PATCH
			);
		} catch (error) {
			if (!(error instanceof Error && 'code' in error && error.code === 'ENOBUFS')) throw error;
		}
	}

	// Only promote the selected blobs and their flat tree out of the temporary object store.
	// Git supplies committed objects through the alternate, so they need no transfer.
	function retain(ids: Set<string>) {
		if (!ids.size) return;
		const tree = run(
			['mktree'],
			[...ids].map((id) => `100644 blob ${id}\t${id}\n`).join('')
		).trim();
		const local = [...ids, tree].filter((id) =>
			existsSync(join(objects, id.slice(0, 2), id.slice(2)))
		);
		const shared = gitEnv(worktree);
		if (local.length) {
			const prefix = join(dir, 'retain');
			const pack = run(['pack-objects', prefix], local.join('\n') + '\n').trim();
			const fd = openSync(`${prefix}-${pack}.pack`, 'r');
			try {
				execFileSync('git', ['unpack-objects', '-q'], {
					cwd: worktree.path,
					env: shared,
					stdio: [fd, 'pipe', 'pipe'],
					timeout: 30_000
				});
			} finally {
				closeSync(fd);
			}
		}
		execFileSync(
			'git',
			[
				'-c',
				'core.hooksPath=' + dir,
				'update-ref',
				`refs/geordi/turns/${workspaceId}/${tree}`,
				tree
			],
			{ cwd: worktree.path, env: shared, timeout: 10_000 }
		);
	}

	try {
		mkdirSync(objects);
		const before = tree();
		return (): TurnDiff | undefined => {
			try {
				const after = tree();
				if (before === after) return;
				const diff = ['diff', '-M', ...SAFE_DIFF_OPTIONS, before, after];
				const raw = run([...diff, '--raw', '--no-abbrev', '-z']).split('\0');
				const stats = run([...diff, '--numstat', '-z']).split('\0');
				const changes = parseFileChanges(raw, stats);
				const operations = { added: 'add', deleted: 'delete', renamed: 'move', modified: 'modify' };
				const files: TurnDiff['files'] = changes.map((file) => ({
					path: file.path,
					operation: operations[file.status],
					...(file.from && { oldPath: file.from }),
					...(file.added === null
						? { fileType: 'binary' }
						: { added: file.added, removed: file.removed ?? 0, blobs: file.blobs })
				}));
				const added = changes.reduce((total, file) => total + (file.added ?? 0), 0);
				const removed = changes.reduce((total, file) => total + (file.removed ?? 0), 0);
				if (!files.length) return;
				const summary = { files, added, removed };
				const ids = new Set<string>();
				for (const { blobs } of files) {
					if (blobs?.old) ids.add(blobs.old);
					if (blobs?.new) ids.add(blobs.new);
				}
				// Keep the offline patch even if the repository cannot retain new objects.
				try {
					retain(ids);
				} catch (error) {
					console.warn('Could not retain turn blobs', error);
				}
				const compact = readPatch(diff);
				return compact === undefined
					? { ...summary, tooLarge: true }
					: { ...summary, patch: compact };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		};
	} catch (error) {
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}
