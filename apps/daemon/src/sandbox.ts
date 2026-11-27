/**
 * Keeps an agent out of the places macOS guards with privacy prompts (FDR-017): external
 * drives, Desktop, Documents, Downloads and the like. macOS holds Geordi responsible for
 * everything it starts, so an agent looking there makes macOS ask the person about Geordi.
 * Under this sandbox the look fails as a plain permission error, before macOS is asked.
 *
 * Everything else is allowed: the goal is no prompts, not a locked-down agent. The places
 * the agent works in are allowed even inside a guarded place (a repository in Documents).
 * A sandboxed process can't start a sandbox of its own, so agents that sandbox their own
 * commands (Auto Mode) are never started in this one.
 */
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { permissionModeOf } from '@geordi/protocol';
import type { SessionOptions } from './agents/adapter.ts';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

/** Guarded places in the home folder. */
const GUARDED_HOME = [
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
];

/** Where a path really is: the sandbox sees resolved paths (`/tmp` is `/private/tmp`). */
function real(path: string) {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/** The places an agent may never reach, and the ones it may reach even inside them. */
export function sandboxPaths(options: SessionOptions, home: string) {
	const deny = ['/Volumes', ...GUARDED_HOME.map((place) => join(home, place))].map(real);
	const allow = [
		options.cwd,
		options.dir,
		...options.writableRoots,
		...(options.worktree
			? [options.worktree.path, dirname(options.worktree.commonDir), options.worktree.commonDir]
			: [])
	].map(real);
	return { deny, allow: [...new Set(allow)] };
}

/**
 * The profile, with every path a parameter (`-D`), so no path is ever parsed as profile
 * text. Later rules win: what is allowed is allowed even inside what is denied.
 */
export function sandboxProfile({ deny, allow }: { deny: string[]; allow: string[] }) {
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
	return { profile, params };
}

/**
 * The command that starts `file` with `args` in the sandbox, where the session asks for it
 * and the system has one; otherwise the command as it is.
 */
export function sandboxed(
	file: string,
	args: string[],
	options: SessionOptions,
	platform = process.platform,
	home = process.env.HOME
): { file: string; args: string[] } {
	if (permissionModeOf(options.settings) !== 'sandboxed' || platform !== 'darwin' || !home)
		return { file, args };
	const { profile, params } = sandboxProfile(sandboxPaths(options, home));
	return { file: SANDBOX_EXEC, args: [...params, '-p', profile, file, ...args] };
}
