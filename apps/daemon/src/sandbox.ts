/**
 * Keeps an agent out of mounted drives and the person's private folders (FDR-017): Desktop,
 * Documents, Downloads and the like. On macOS these are the places guarded by privacy
 * prompts, and macOS holds Geordi responsible for everything it starts: an agent looking
 * there would make macOS ask the person about Geordi. In the sandbox the look fails before
 * macOS is asked.
 *
 * Everything else is allowed: the goal is privacy without prompts, not a locked-down agent.
 * The places the agent works in are allowed even inside a guarded place (a repository in
 * Documents). A sandboxed process can't start a sandbox of its own, so agents that sandbox
 * their own commands (Auto Mode) are never started in this one.
 *
 * - macOS: `sandbox-exec`, which denies the places (a plain permission error).
 * - Linux: bubblewrap, where installed and allowed to run: the places are covered by empty,
 *   read-only folders.
 * - Elsewhere there is no sandbox, and the mode is not offered.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { permissionModeOf } from '@geordi/protocol';
import type { SessionOptions } from './agents/adapter.ts';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const BWRAP = 'bwrap';

/** Guarded places, per system: mounted drives, and private folders in the home folder. */
const GUARDED: Partial<Record<NodeJS.Platform, { mounts: string[]; home: string[] }>> = {
	darwin: {
		mounts: ['/Volumes'],
		home: [
			'Desktop',
			'Documents',
			'Downloads',
			'Movies',
			'Music',
			'Pictures',
			'Library/Mobile Documents',
			'Library/Mail',
			'Library/Messages',
			'Library/Calendars',
			'Library/Application Support/AddressBook',
			'Library/Application Support/CallHistoryDB',
			'Library/Safari'
		]
	},
	linux: {
		mounts: ['/media', '/mnt', '/run/media'],
		home: ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Videos']
	}
};

export const NO_SANDBOX =
	'Geordi can’t sandbox agents on this computer. Choose Full Permissions for this workspace.' +
	(process.platform === 'linux' ? ' To sandbox them, install bubblewrap (`bwrap`).' : '');

let available: boolean | undefined;

/**
 * Whether agents can be sandboxed on this computer. Bubblewrap needs to be installed, and
 * allowed to make namespaces (some systems forbid it): it is tried once.
 */
export function canSandbox(): boolean {
	available ??=
		process.platform === 'darwin'
			? existsSync(SANDBOX_EXEC)
			: process.platform === 'linux' &&
				spawnSync(BWRAP, ['--dev-bind', '/', '/', 'true'], { stdio: 'ignore', timeout: 5000 })
					.status === 0;
	return available;
}

/** Where a path really is: sandboxes see resolved paths (`/tmp` is `/private/tmp`). */
function real(path: string) {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

const inside = (path: string, parent: string) =>
	path === parent || path.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/** The places an agent may never reach, and the ones it may reach even inside them. */
export function sandboxPaths(options: SessionOptions, home: string, platform = process.platform) {
	const guarded = GUARDED[platform] ?? { mounts: [], home: [] };
	const deny = [...guarded.mounts, ...guarded.home.map((place) => join(home, place))].map(real);
	const allow = [
		options.cwd,
		options.dir,
		...options.writableRoots,
		...(options.worktree
			? [options.worktree.path, dirname(options.worktree.commonDir), options.worktree.commonDir]
			: [])
	].map(real);
	return { deny: [...new Set(deny)], allow: [...new Set(allow)] };
}

type Paths = ReturnType<typeof sandboxPaths>;
type Command = { file: string; args: string[] };

/**
 * macOS: a profile with every path a parameter (`-D`), so no path is ever parsed as profile
 * text. Later rules win: what is allowed is allowed even inside what is denied.
 */
export function seatbelt({ deny, allow }: Paths, { file, args }: Command): Command {
	const rule = (verdict: string, prefix: string, paths: string[]) =>
		paths.length
			? `(${verdict} file-read* file-write* ${paths.map((_, i) => `(subpath (param "${prefix}${i}"))`).join(' ')})`
			: '';
	const profile = [
		'(version 1)',
		'(allow default)',
		rule('deny', 'DENY', deny),
		rule('allow', 'ALLOW', allow)
	]
		.filter(Boolean)
		.join('\n');
	const params = [
		...deny.flatMap((path, i) => ['-D', `DENY${i}=${path}`]),
		...allow.flatMap((path, i) => ['-D', `ALLOW${i}=${path}`])
	];
	return { file: SANDBOX_EXEC, args: [...params, '-p', profile, file, ...args] };
}

/**
 * Linux: the whole system as it is, with each guarded place that exists covered by an empty
 * folder, and the allowed places inside them put back. The covers are made read-only last,
 * so that writing there fails rather than vanishing with the sandbox.
 */
export function bubblewrap({ deny, allow }: Paths, { file, args }: Command): Command {
	const covered = deny.filter((path) => existsSync(path));
	const kept = allow.filter(
		(path) => existsSync(path) && covered.some((cover) => inside(path, cover))
	);
	return {
		file: BWRAP,
		args: [
			'--dev-bind',
			'/',
			'/',
			...covered.flatMap((path) => ['--tmpfs', path]),
			...kept.flatMap((path) => ['--bind', path, path]),
			...covered.flatMap((path) => ['--remount-ro', path]),
			'--',
			file,
			...args
		]
	};
}

/**
 * The command that starts `file` with `args`: in the sandbox where the session's mode asks
 * for one, otherwise as it is. A workspace that never chose a mode is sandboxed where that
 * is possible. One that chose the sandbox where there is none is refused before it gets
 * here (`turn-starts.ts`); never is it started without.
 */
export function sandboxed(
	file: string,
	args: string[],
	options: SessionOptions,
	platform = process.platform,
	home = process.env.HOME,
	possible = canSandbox()
): Command {
	if (permissionModeOf(options.settings, possible) !== 'sandboxed') return { file, args };
	if (!possible || !home) throw new Error(NO_SANDBOX);
	const paths = sandboxPaths(options, home, platform);
	return (platform === 'darwin' ? seatbelt : bubblewrap)(paths, { file, args });
}
