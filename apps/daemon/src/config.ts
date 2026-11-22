import { git } from './git.ts';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
	CONFIG_FILE,
	CONFIG_NAME,
	portVariable,
	SCRIPTS,
	type RepoConfig,
	type Task
} from '@geordi/protocol';
import { parse as parseYaml } from 'yaml';
import { readText } from './changes.ts';
import { portAt, portKey, spareOf, type Assigned } from './ports.ts';
import { startOf, type Worktree } from './worktree.ts';

/** Commands are for a shell to run, not for storing things in. */
const MAX_COMMAND = 2000;
const MAX_URL = 500;
/** Ports in a link: `{http}`, the task's own; `{web.http}`, another task's. */
const PLACEHOLDER = /\{([^{}]*)\}/g;
/** Links only ever lead to this machine: the file is not to be a way to send people anywhere. */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)$/;
/** What the file was called, and in what it was written, before (FDR-006). */
const OLD_FILE = '.geordi.toml';
/** What it said before it said `tasks`. */
const OLD_SETTINGS = ['run', 'jobs', 'urls', 'default', 'ports'];

/** A task as the file says it, before a workspace's ports are filled in. */
export type TaskSettings = {
	name: string;
	label?: string;
	command: string | null;
	ports: string[];
	/** With their ports as `{task.port}`. */
	links: { name: string; label?: string; url: string }[];
	needs: string[];
	default: boolean;
};

/** What a `.geordi.yml` says, before a workspace's ports are filled in. */
export type Settings = {
	tasks: TaskSettings[];
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

function nameList(value: unknown, where: string, what: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((name) => typeof name === 'string'))
		return fail(`${where} must be a list of ${what} names`);
	for (const name of value)
		if (!CONFIG_NAME.test(name))
			fail(`${where}: "${name}" is not a name: lower case letters, digits and dashes`);
	if (new Set(value).size !== value.length) fail(`${where} names one twice`);
	return value;
}

const command = (value: unknown, where: string) => {
	if (typeof value !== 'string' || !value.trim() || value.length > MAX_COMMAND)
		fail(`${where} must be a command, as a string`);
	return (value as string).trim();
};

/**
 * A task's links, from `url` (one) or `urls` (several, by name), with each port as
 * `{task.port}`; and the other tasks whose ports they use.
 */
function linksOf(task: Record<string, unknown>, name: string) {
	if (task.url !== undefined && task.urls !== undefined)
		fail(`tasks.${name}: say url or urls, not both`);
	const said: [string, unknown, string][] =
		task.url !== undefined
			? [[name, { url: task.url }, `tasks.${name}.url`]]
			: Object.entries(
					task.urls === undefined
						? {}
						: isTable(task.urls)
							? task.urls
							: fail(`tasks.${name}.urls must be links, each under its name`)
				).map(([key, value]) => [key, value, `tasks.${name}.urls.${key}`]);
	const uses = new Set<string>();
	const links = said.map(([key, value, where]) => {
		if (!CONFIG_NAME.test(key))
			fail(`"${key}" is not a link name: lower case letters, digits and dashes`);
		const link = isTable(value) ? value : { url: value };
		const url = link.url;
		if (typeof url !== 'string' || url.length > MAX_URL)
			fail(`${where} must be an address, as a string`);
		let address: URL | undefined;
		try {
			address = new URL((url as string).replace(PLACEHOLDER, '1'));
		} catch {
			// said below
		}
		if (!address || !/^https?:$/.test(address.protocol) || !LOCAL.test(address.hostname))
			fail(`${where} must be an http address on this machine (localhost)`);
		const resolved = (url as string).replace(PLACEHOLDER, (_, said: string) => {
			const [owner, port] = said.includes('.') ? said.split('.', 2) : [name, said];
			if (owner !== name) uses.add(owner);
			return `{${owner}.${port}}`;
		});
		return {
			name: key,
			...displayLabel(link.label, where.replace(/\.url$/, '')),
			url: resolved
		};
	});
	return { links, uses: [...uses] };
}

/** What a `.geordi.yml` says, as far as we understand it. Throws for what isn't one. */
export function parseConfig(text: string): Settings {
	// (an empty file says nothing, which is fine)
	const said: unknown = parseYaml(text) ?? {};
	if (!isTable(said)) fail('it must be settings, each under its name');
	const settings = said as Record<string, unknown>;
	const old = OLD_SETTINGS.filter((key) => key in settings);
	if (old.length > 0)
		fail(
			`${old.map((key) => `\`${key}\``).join(', ')} ${old.length === 1 ? 'is' : 'are'} no longer read: say what to run under \`tasks\`, each with the ports it listens on`
		);

	const entries = Object.entries(
		settings.tasks === undefined
			? {}
			: isTable(settings.tasks)
				? settings.tasks
				: fail('`tasks` must be tasks, each under its name')
	);
	const known = new Set(entries.map(([name]) => name));
	const tasks = entries.map(([name, value]): TaskSettings => {
		if (!CONFIG_NAME.test(name))
			fail(`"${name}" is not a task name: lower case letters, digits and dashes`);
		if ((SCRIPTS as readonly string[]).includes(name))
			fail(`"${name}" is not a task name: say \`${name}: …\` for the ${name} script`);
		const task = isTable(value) ? value : fail(`tasks.${name} must be settings`);
		const { links, uses } = linksOf(task, name);
		if (task.command === undefined && links.length === 0)
			fail(`tasks.${name} needs a command, a url, or both`);
		if (task.default !== undefined && typeof task.default !== 'boolean')
			fail(`tasks.${name}.default must be true or false`);
		const needs = nameList(task.needs, `tasks.${name}.needs`, 'task');
		for (const needed of [...needs, ...uses])
			if (!known.has(needed)) fail(`tasks.${name}: there is no task "${needed}"`);
		const ports = nameList(task.ports, `tasks.${name}.ports`, 'port');
		if (task.command === undefined && ports.length > 0)
			fail(`tasks.${name}.ports: only a task with a command listens on ports`);
		return {
			name,
			...displayLabel(task.label, `tasks.${name}`),
			command: task.command === undefined ? null : command(task.command, `tasks.${name}.command`),
			ports,
			links,
			// a port another task has is only there once that task is up
			needs: [...new Set([...needs, ...uses])],
			default: task.default === true
		};
	});

	const byName = new Map(tasks.map((task) => [task.name, task]));
	for (const task of tasks)
		for (const link of task.links)
			for (const [, port] of link.url.matchAll(PLACEHOLDER)) {
				const [owner, name] = port.split('.');
				if (!byName.get(owner)?.ports.includes(name))
					fail(`tasks.${task.name}: ${owner} has no port "${name}" (list it under its ports)`);
			}
	// a task that needs itself, however indirectly, never gets its turn to start
	const reach = (name: string, seen: string[]): boolean =>
		seen.includes(name) ||
		(byName.get(name)?.needs ?? []).some((needed) => reach(needed, [...seen, name]));
	for (const task of tasks)
		if (reach(task.name, [])) fail(`tasks.${task.name} needs itself, through other tasks`);
	// two ports must not reach everyone by one name
	const variables = new Map<string, string>();
	for (const task of tasks)
		for (const [index, port] of task.ports.entries())
			for (const variable of [
				portVariable(task.name, port),
				...(index === 0 ? [portVariable(task.name)] : [])
			]) {
				const other = variables.get(variable);
				if (other) fail(`tasks.${task.name}.ports: ${port} and ${other} would both be ${variable}`);
				variables.set(variable, `${task.name}.${port}`);
			}

	const [setup, teardown] = SCRIPTS.map((script) =>
		settings[script] === undefined ? null : command(settings[script], `\`${script}\``)
	);
	return { tasks, setup, teardown };
}

/**
 * The file that applies to a workspace (FDR-006), by name and with its text: the
 * workspace's own if it has one (so that a change to it can be tried out there), and
 * otherwise the one on the branch work starts from (the upstream's main branch; see
 * `startOf`), so that a workspace that branched off before the file existed gets it too.
 * A workspace with a file by the old name only is told to move it.
 */
async function fileFor(worktree: Worktree, repoPath: string) {
	const there = (file: string) => !!lstatSync(join(worktree.path, file), { throwIfNoEntry: false });
	if (there(CONFIG_FILE))
		return {
			source: 'workspace' as const,
			file: CONFIG_FILE,
			text: readText(worktree, CONFIG_FILE)
		};
	if (there(OLD_FILE)) return { source: 'workspace' as const, file: OLD_FILE, text: null };
	const start = await startOf(repoPath);
	try {
		const text = await git(repoPath, ['cat-file', 'blob', `${start}:${CONFIG_FILE}`]);
		return { source: 'base' as const, file: CONFIG_FILE, text };
	} catch {
		return null; // not there either: the repository has nothing to say
	}
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
	if (file === OLD_FILE)
		return {
			settings: null,
			source,
			file,
			problem: `${OLD_FILE} is no longer read: write its settings as YAML in ${CONFIG_FILE}`
		};
	if (text === null) return { settings: null, source, file, problem: `${file} can't be read` };
	try {
		return { settings: parseConfig(text), problem: null, source, file };
	} catch (error) {
		// the main branch's file is not this workspace's to fix: it simply has nothing to say
		if (source === 'base') return { settings: null, problem: null, source: null, file: null };
		const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
		return { settings: null, source, file, problem: `${file}: ${reason}` };
	}
}

const script = (command: string | null | undefined, approved: (command: string) => boolean) =>
	command ? { command, approved: approved(command) } : null;

/** The ports a workspace's tasks want, as `ports.ensure` is asked for them. */
export const wantedPorts = (settings: Settings | null) =>
	(settings?.tasks ?? []).flatMap((task) =>
		task.ports.map((port, index) => ({
			key: portKey(task.name, port),
			...(index === 0 && { legacy: task.name })
		}))
	);

/**
 * The configuration as the workspace gets it: every task with its ports and whether a
 * person has agreed to run its command, every link with the ports filled in.
 */
export function resolve(
	{ settings, problem, source, file }: Found,
	assigned: Assigned,
	/** Whether a person has agreed to run this command in this repository. */
	approved: (command: string) => boolean
): RepoConfig {
	const port = (key: string) => portAt(assigned, assigned.jobs[key]);
	return {
		tasks: (settings?.tasks ?? []).map((task): Task => ({
			...task,
			approved: task.command === null || approved(task.command),
			ports: task.ports.map((name) => ({ name, port: port(portKey(task.name, name)) })),
			links: task.links.map(({ url, ...link }) => ({
				...link,
				href: url.replace(PLACEHOLDER, (_, key: string) => String(port(key)))
			}))
		})),
		setup: script(settings?.setup, approved),
		teardown: script(settings?.teardown, approved),
		ports: spareOf(assigned),
		problem,
		source,
		file
	};
}
