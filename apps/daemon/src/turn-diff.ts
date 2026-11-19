import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseFileChanges } from './changes.ts';
import { gitEnv, type Worktree } from './worktree.ts';
import type { TurnDiff } from '@geordi/protocol';

const SAFE = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=all'];
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
		copyFileSync(join(worktree.adminDir, 'index'), index);
		const tracked = run(['diff-files', '--name-only', '-z', ...SAFE]);
		const untracked = run(['ls-files', '--others', '--exclude-standard', '-z']);
		// Embedded repositories are listed as directories. Never descend into them.
		const paths = (tracked + untracked).split('\0').filter((path) => path && !path.endsWith('/'));
		if (paths.length)
			run(['update-index', '--add', '--remove', '-z', '--stdin'], paths.join('\0') + '\0');
		return run(['write-tree']).trim();
	}

	try {
		mkdirSync(objects);
		const before = tree();
		return (): TurnDiff | undefined => {
			try {
				const after = tree();
				if (before === after) return;
				const diff = ['diff', '-M', ...SAFE, before, after];
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
				try {
					return {
						files,
						added,
						removed,
						patch: run(
							[...diff, '--patch', '--src-prefix=a/', '--dst-prefix=b/'],
							undefined,
							MAX_PATCH
						)
					};
				} catch (error) {
					if (!(error instanceof Error && 'code' in error && error.code === 'ENOBUFS')) throw error;
					return { files, added, removed, tooLarge: true };
				}
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		};
	} catch (error) {
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}
