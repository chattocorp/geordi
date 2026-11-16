import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE, CONFIG_SETTINGS, type RepoConfig, type RepoSettings } from '@geordi/protocol';
import { parse } from 'smol-toml';
import { readText } from './changes.ts';
import { startOf, type Worktree } from './worktree.ts';

/** Commands are for a shell to run, not for storing things in. */
const MAX_COMMAND = 2000;

const SETTINGS = Object.keys(CONFIG_SETTINGS) as (keyof typeof CONFIG_SETTINGS)[];
const nothing = () => Object.fromEntries(SETTINGS.map((key) => [key, null])) as RepoSettings;

/** What a `.geordi.toml` says, as far as we understand it. Throws for what isn't one. */
export function parseConfig(text: string): RepoSettings {
	const said = parse(text);
	const settings = nothing();
	for (const key of SETTINGS) {
		const value = said[key];
		if (value === undefined) continue;
		if (typeof value !== 'string' || value.length > MAX_COMMAND)
			throw new Error(`\`${key}\` must be a command, as a string`);
		settings[key] = value.trim() || null;
	}
	return settings;
}

/**
 * The repository's configuration as it applies to a workspace (FDR-006): the workspace's
 * own `.geordi.toml` if it has one (so that a change to it can be tried out there), and
 * otherwise the one on the branch work starts from (the upstream's main branch; see
 * `startOf`), so that a workspace that branched off before the file existed gets it too.
 *
 * A file that can't be made sense of says so (`problem`) rather than making way for the
 * other one: whoever is working on it should hear about it.
 */
export function configOf(worktree: Worktree, repoPath: string): RepoConfig {
	const none: RepoConfig = { ...nothing(), problem: null, source: null };
	let text: string | null;
	let source: RepoConfig['source'] = 'base';
	if (lstatSync(join(worktree.path, CONFIG_FILE), { throwIfNoEntry: false })) {
		source = 'workspace';
		text = readText(worktree, CONFIG_FILE);
		if (text === null) return { ...none, source, problem: `${CONFIG_FILE} can't be read` };
	} else {
		try {
			text = execFileSync(
				'git',
				['-C', repoPath, 'cat-file', 'blob', `${startOf(repoPath)}:${CONFIG_FILE}`],
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
			);
		} catch {
			return none; // not there either: the repository has nothing to say
		}
	}

	try {
		return { ...parseConfig(text), problem: null, source };
	} catch (error) {
		const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
		return { ...none, source, problem: `${CONFIG_FILE}: ${reason}` };
	}
}
