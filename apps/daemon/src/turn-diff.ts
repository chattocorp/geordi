import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { parseFileChanges, SAFE_DIFF_OPTIONS } from './changes.ts';
import { gitEnv, type Worktree } from './worktree.ts';
import type { TurnDiff } from '@geordi/protocol';

const MAX_PATCH = 256 * 1024;

/** Called in the detached host. Capture each boundary before the CLI can receive its next prompt. */
export function startTurnDiff(worktree: Worktree, sessionDir: string) {
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

	/** An oversized patch can be retried with less context. Other Git errors propagate. */
	function readPatch(diff: string[], context: number) {
		try {
			return run(
				[
					'-c',
					'diff.suppressBlankEmpty=false',
					...diff,
					`--unified=${context}`,
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

	try {
		mkdirSync(objects);
		const before = tree();
		return (): TurnDiff | undefined => {
			try {
				const after = tree();
				if (before === after) return;
				const diff = ['diff', '-M', ...SAFE_DIFF_OPTIONS, before, after];
				const names = run([...diff, '--name-status', '-z']).split('\0');
				const stats = run([...diff, '--numstat', '-z']).split('\0');
				const changes = parseFileChanges(names, stats);
				const operations = { added: 'add', deleted: 'delete', renamed: 'move', modified: 'modify' };
				const files = changes.map((file) => ({
					path: file.path,
					operation: operations[file.status],
					...(file.from && { oldPath: file.from }),
					...(file.added === null && { fileType: 'binary' })
				}));
				const added = changes.reduce((total, file) => total + (file.added ?? 0), 0);
				const removed = changes.reduce((total, file) => total + (file.removed ?? 0), 0);
				if (!files.length) return;
				const summary = { files, added, removed };
				// Each context line costs at least one byte, so MAX_PATCH lines
				// cover both sides of any text change that fits in the saved patch.
				const full = readPatch(diff, MAX_PATCH);
				if (full !== undefined) return { ...summary, patch: full, fullContext: true };
				const compact = readPatch(diff, 3);
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
