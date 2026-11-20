import { git } from './git.ts';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
	CONFIG_FILES,
	CONFIG_NAME,
	DEFAULT_PORTS,
	SCRIPTS,
	startOrder,
	type RepoConfig
} from '@geordi/protocol';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { readText } from './changes.ts';
import { portAt, type Assigned } from './ports.ts';
import { startOf, type Worktree } from './worktree.ts';

/** Commands are for a shell to run, not for storing things in. */
const MAX_COMMAND = 2000;
const MAX_URL = 500;
const MAX_PORTS = 100;
/** A job's port in a link: `{web}`. */
const PLACEHOLDER = /\{([^{}]*)\}/g;
/** Links only ever lead to this machine: the file is not to be a way to send people anywhere. */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)$/;

/** What a `.geordi.yml` says, before a workspace's ports are filled in. */
export type Settings = {
	default?: RepoConfig['default'];
	ports: number;
	jobs: { label?: string; name: string; command: string; needs: string[] }[];
	urls: { label?: string; name: string; url: string; needs: string[] }[];
	/** The commands run when a worktree is made, and before it is removed. */
	setup: string | null;
	teardown: string | null;
};

const fail = (message: string): never => {
	throw new Error(message);
};
const isTable = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Display names never replace the keys used by dependencies and ports. */
function displayLabel(value: unknown, where: string): { label?: string } {
	if (value === undefined) return {};
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.trim().length > 100 ||
		/[\r\n\t]/.test(value)
	)
		fail(`${where}.label must be a non-empty, single-line string of at most 100 characters`);
	return { label: (value as string).trim() };
}

function names(value: unknown, what: string, known: Set<string>): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((name) => typeof name === 'string'))
		fail(`${what} must be a list of job names`);
	for (const name of value as string[])
		if (!known.has(name)) fail(`${what}: there is no job "${name}"`);
	return [...new Set(value as string[])];
}

/** What the file says, in whichever of the two languages its name says it is written in. */
function read(text: string, file: string): Record<string, unknown> {
	if (file.endsWith('.toml')) return parseToml(text);
	// (an empty file says nothing, which is fine)
	const said: unknown = parseYaml(text) ?? {};
	return isTable(said) ? said : fail('it must be settings, each under its name');
}

/**
 * What a `.geordi.yml` says, as far as we understand it (or a `.geordi.toml`, going by
 * `file`'s name). Throws for what isn't one.
 */
export function parseConfig(text: string, file: string = CONFIG_FILES[0]): Settings {
	const said = read(text, file);

	const commands = new Map<string, { command: unknown; needs: unknown; label?: unknown }>();
	if (said.jobs !== undefined) {
		if (!isTable(said.jobs)) fail('`jobs` must be a table of jobs');
		for (const [name, job] of Object.entries(said.jobs as Record<string, unknown>)) {
			if (!isTable(job)) fail(`jobs.${name} must be a table with a command`);
			commands.set(name, job as { command: unknown; needs: unknown; label?: unknown });
		}
	}
	// `run = "…"` is short for a single job of that name
	if (said.run !== undefined) {
		if (commands.has('run')) fail('`run` and `jobs.run` are the same job: name it once');
		commands.set('run', { command: said.run, needs: undefined });
	}

	const known = new Set(commands.keys());
	const jobs = [...commands].map(([name, { command, needs, label }]) => {
		if (!CONFIG_NAME.test(name))
			fail(`"${name}" is not a job name: lower case letters, digits and dashes`);
		if ((SCRIPTS as readonly string[]).includes(name))
			fail(`"${name}" is not a job name: say \`${name}: …\` for the ${name} script`);
		if (typeof command !== 'string' || !command.trim() || command.length > MAX_COMMAND)
			fail(
				`${name === 'run' && !isTable(said.jobs) ? '`run`' : `jobs.${name}.command`} must be a command, as a string`
			);
		return {
			name,
			...displayLabel(label, `jobs.${name}`),
			command: (command as string).trim(),
			needs: names(needs, `jobs.${name}.needs`, known)
		};
	});
	for (const job of jobs)
		if (!startOrder(jobs, [job.name]).includes(job.name) || job.needs.includes(job.name))
			fail(`jobs.${job.name} needs itself`);
	// a job that needs itself through others never gets its turn to start
	for (const job of jobs) {
		const reach = (name: string, seen: string[]): boolean =>
			seen.includes(name) ||
			(jobs.find((other) => other.name === name)?.needs ?? []).some((needed) =>
				reach(needed, [...seen, name])
			);
		if (reach(job.name, [])) fail(`jobs.${job.name} needs itself, through other jobs`);
	}

	const urls: Settings['urls'] = [];
	if (said.urls !== undefined) {
		if (!isTable(said.urls)) fail('`urls` must be a table of links');
		for (const [name, link] of Object.entries(said.urls as Record<string, unknown>)) {
			if (!CONFIG_NAME.test(name))
				fail(`"${name}" is not a name: lower case letters, digits and dashes`);
			const url = isTable(link) ? link.url : undefined;
			if (typeof url !== 'string' || url.length > MAX_URL)
				fail(`urls.${name}.url must be an address, as a string`);
			const mentioned = [...(url as string).matchAll(PLACEHOLDER)].map((match) => match[1]);
			for (const job of mentioned)
				if (!known.has(job)) fail(`urls.${name}: there is no job "${job}"`);
			let address: URL | undefined;
			try {
				address = new URL((url as string).replace(PLACEHOLDER, '1'));
			} catch {
				// said below
			}
			if (!address || !/^https?:$/.test(address.protocol) || !LOCAL.test(address.hostname))
				fail(`urls.${name}.url must be an http address on this machine (localhost)`);
			const needs = names((link as Record<string, unknown>).needs, `urls.${name}.needs`, known);
			urls.push({
				name,
				...displayLabel((link as Record<string, unknown>).label, `urls.${name}`),
				url: url as string,
				needs: [...new Set([...mentioned, ...needs])]
			});
		}
	}

	// One port per job is what a repository needs unless it says it wants spare ones. With
	// no jobs there is nothing to count: then it is the number any workspace gets.
	const ports = said.ports ?? (jobs.length || DEFAULT_PORTS);
	if (typeof ports !== 'number' || !Number.isInteger(ports) || ports < 1 || ports > MAX_PORTS)
		fail(`\`ports\` must be a number from 1 to ${MAX_PORTS}`);
	const [setup, teardown] = SCRIPTS.map((script) => {
		const command = said[script];
		if (command === undefined) return null;
		if (typeof command !== 'string' || !command.trim() || command.length > MAX_COMMAND)
			fail(`\`${script}\` must be a command, as a string`);
		return (command as string).trim();
	});
	const settings: Settings = {
		ports: Math.max(ports as number, jobs.length),
		jobs,
		urls,
		setup,
		teardown
	};
	const targets = [
		...jobs.map(({ name }) => `jobs.${name}` as const),
		...urls.map(({ name }) => `urls.${name}` as const)
	];
	if (said.default !== undefined)
		settings.default =
			targets.find((target) => target === said.default) ??
			fail('`default` must name a configured job or URL, such as jobs.web or urls.app');
	else if (targets.includes('jobs.run')) settings.default = 'jobs.run';
	return settings;
}

/**
 * The file that applies to a workspace (FDR-006), by name and with its text: the
 * workspace's own if it has one (so that a change to it can be tried out there), and
 * otherwise the one on the branch work starts from (the upstream's main branch; see
 * `startOf`), so that a workspace that branched off before the file existed gets it too.
 * Where there is one of each name, the first of `CONFIG_FILES` is the one.
 */
async function fileFor(worktree: Worktree, repoPath: string) {
	for (const file of CONFIG_FILES)
		if (lstatSync(join(worktree.path, file), { throwIfNoEntry: false }))
			return { source: 'workspace' as const, file, text: readText(worktree, file) };
	const start = await startOf(repoPath);
	for (const file of CONFIG_FILES)
		try {
			const text = await git(repoPath, ['cat-file', 'blob', `${start}:${file}`]);
			return { source: 'base' as const, file, text };
		} catch {
			// not there by this name
		}
	return null; // not there either: the repository has nothing to say
}

type Found = {
	settings: Settings | null;
	problem: string | null;
	source: RepoConfig['source'];
	file: string | null;
};

/**
 * What the repository's configuration says for a workspace, before its ports are known. A
 * workspace's file that can't be made sense of says so (`problem`) rather than making way
 * for the other one: whoever is working on it should hear about it.
 */
export async function settingsOf(worktree: Worktree, repoPath: string): Promise<Found> {
	const found = await fileFor(worktree, repoPath);
	if (!found) return { settings: null, problem: null, source: null, file: null };
	const { source, file, text } = found;
	if (text === null) return { settings: null, source, file, problem: `${file} can't be read` };
	try {
		return { settings: parseConfig(text, file), problem: null, source, file };
	} catch (error) {
		// the main branch's file is not this workspace's to fix: it simply has nothing to say
		if (source === 'base') return { settings: null, problem: null, source: null, file: null };
		const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
		return { settings: null, source, file, problem: `${file}: ${reason}` };
	}
}

const script = (command: string | null | undefined, approved: (command: string) => boolean) =>
	command ? { command, approved: approved(command) } : null;

/**
 * The configuration as the workspace gets it: every job with its port and whether a person
 * has agreed to run it, every link with the ports filled in.
 */
export function resolve(
	{ settings, problem, source, file }: Found,
	assigned: Assigned,
	/** Whether a person has agreed to run this command in this repository. */
	approved: (command: string) => boolean
): RepoConfig {
	const port = (job: string) => portAt(assigned, assigned.jobs[job]);
	const count = assigned.blocks.reduce((sum, block) => sum + block.count, 0);
	return {
		default: settings?.default,
		jobs: (settings?.jobs ?? []).map((job) => ({
			...job,
			port: port(job.name),
			approved: approved(job.command)
		})),
		urls: (settings?.urls ?? []).map(({ url, ...link }) => ({
			...link,
			href: url.replace(PLACEHOLDER, (_, job: string) => String(port(job)))
		})),
		setup: script(settings?.setup, approved),
		teardown: script(settings?.teardown, approved),
		ports: { first: portAt(assigned, 0), count },
		problem,
		source,
		file
	};
}
