import { git } from './git.ts';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
	CONFIG_FILE,
	CONFIG_NAME,
	SCRIPTS,
	type RepoConfig,
	type RepoSection,
	type Task
} from '@geordi/protocol';
import { parse as parseYaml } from 'yaml';
import { readText } from './changes.ts';
import { portAt, portKey, spareOf, type Assigned } from './ports.ts';
import { startOf, type Worktree } from './worktree.ts';

/** Commands are for a shell to run, not for storing things in. */
const MAX_COMMAND = 2000;
const MAX_URL = 500;
const MAX_SECTIONS = 100;
/** What a section's `icon` may be: a picture the worktree's are shown as. */
const PICTURE = /\.(png|jpe?g|webp|gif|svg)$/i;
/** A port in a URL, by its name: `{http}`. */
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
	/** With its ports as `{task.port}`. */
	url: string | null;
	needs: string[];
	default: boolean;
};

/** What a `.geordi.yml` says, before a workspace's ports are filled in. */
export type Settings = {
	tasks: TaskSettings[];
	/** The commands run when a worktree is made, and before it is removed. */
	setup: string | null;
	teardown: string | null;
	sections: RepoSection[];
};

const fail = (message: string): never => {
	throw new Error(message);
};
const isTable = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A name to show: one line of text, trimmed. */
function displayText(value: unknown, where: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.trim().length > 100 ||
		/[\r\n\t]/.test(value)
	)
		fail(`${where} must be a non-empty, single-line string of at most 100 characters`);
	return (value as string).trim();
}

/** Display names never replace the keys used by dependencies and ports. */
function displayLabel(value: unknown, where: string): { label?: string } {
	return value === undefined ? {} : { label: displayText(value, `${where}.label`) };
}

/** A path in the repository, from its top (`apps/web`, not `/apps/web` or `../web`), or `null`. */
function repoPath(said: unknown): string | null {
	const path = typeof said === 'string' ? said.trim().replace(/^\.\//, '').replace(/\/+$/, '') : '';
	return !path ||
		path.length > MAX_URL ||
		path.startsWith('/') ||
		/[\\\r\n\t]/.test(path) ||
		path.split('/').some((part) => part === '' || part === '.' || part === '..')
		? null
		: path;
}

/** The repository's parts: directories in it, each with a title, and perhaps its picture. */
function parseSections(value: unknown): RepoSection[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > MAX_SECTIONS)
		fail(
			`\`sections\` must be a list of at most ${MAX_SECTIONS} sections, each with a path and a title`
		);
	const seen = new Set<string>();
	return (value as unknown[]).map((section, index) => {
		const where = `sections[${index}]`;
		if (!isTable(section)) fail(`${where} must have a path and a title`);
		const { path: said, title, icon } = section as Record<string, unknown>;
		const path =
			repoPath(said) ??
			fail(`${where}.path must be a directory in the repository, such as apps/web`);
		if (seen.has(path)) fail(`${where}.path: ${path} is named twice`);
		seen.add(path);
		return {
			path,
			title: displayText(title, `${where}.title`),
			...(icon !== undefined && {
				icon:
					(PICTURE.test(String(icon)) ? repoPath(icon) : null) ??
					fail(
						`${where}.icon must be a picture in the repository, such as apps/web/static/logo.svg`
					)
			})
		};
	});
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

/** A task's `url`, if it has one. */
function urlOf(task: Record<string, unknown>, name: string): string | null {
	if (task.urls !== undefined)
		fail(`tasks.${name}.urls is no longer read: give each URL a task of its own, with \`url\``);
	const url = task.url;
	if (url === undefined) return null;
	if (typeof url !== 'string' || url.length > MAX_URL)
		fail(`tasks.${name}.url must be an address, as a string`);
	let address: URL | undefined;
	try {
		address = new URL((url as string).replace(PLACEHOLDER, '1'));
	} catch {
		// said below
	}
	if (!address || !/^https?:$/.test(address.protocol) || !LOCAL.test(address.hostname))
		fail(`tasks.${name}.url must be an http address on this machine (localhost)`);
	return url as string;
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
		const url = urlOf(task, name);
		if (task.command === undefined && url === null)
			fail(`tasks.${name} needs a command, a url, or both`);
		if (task.default !== undefined && typeof task.default !== 'boolean')
			fail(`tasks.${name}.default must be true or false`);
		const needs = nameList(task.needs, `tasks.${name}.needs`, 'task');
		for (const needed of needs)
			if (!known.has(needed)) fail(`tasks.${name}: there is no task "${needed}"`);
		const ports = nameList(task.ports, `tasks.${name}.ports`, 'port');
		if (task.command === undefined && ports.length > 0)
			fail(`tasks.${name}.ports: only a task with a command listens on ports`);
		return {
			name,
			...displayLabel(task.label, `tasks.${name}`),
			command: task.command === undefined ? null : command(task.command, `tasks.${name}.command`),
			ports,
			url,
			needs,
			default: task.default === true
		};
	});

	// Ports are the workspace's, by name, and each is one task's: two can't listen on one.
	const owners = new Map<string, TaskSettings>();
	for (const task of tasks)
		for (const port of task.ports) {
			const other = owners.get(port);
			if (other)
				fail(
					`tasks.${task.name}.ports: "${port}" is ${other.name}'s already (give it another name)`
				);
			owners.set(port, task);
		}
	for (const task of tasks)
		for (const [, port] of task.url?.matchAll(PLACEHOLDER) ?? []) {
			const owner =
				owners.get(port) ??
				fail(`tasks.${task.name}.url: no task lists a port "${port}" (list it under its ports)`);
			// a port is only there once the task that listens on it is up
			if (owner !== task && !task.needs.includes(owner.name)) task.needs.push(owner.name);
		}
	const byName = new Map(tasks.map((task) => [task.name, task]));
	// a task that needs itself, however indirectly, never gets its turn to start
	const reach = (name: string, seen: string[]): boolean =>
		seen.includes(name) ||
		(byName.get(name)?.needs ?? []).some((needed) => reach(needed, [...seen, name]));
	for (const task of tasks)
		if (reach(task.name, [])) fail(`tasks.${task.name} needs itself, through other tasks`);

	const [setup, teardown] = SCRIPTS.map((script) =>
		settings[script] === undefined ? null : command(settings[script], `\`${script}\``)
	);
	return { tasks, setup, teardown, sections: parseSections(settings.sections) };
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
			key: portKey(port),
			// what it was kept as before: `task.port`, and before that the task's one port, by its name
			legacy: [`${task.name}.${port}`, ...(index === 0 ? [task.name] : [])]
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
		tasks: (settings?.tasks ?? []).map(({ url, ...task }): Task => ({
			...task,
			approved: task.command === null || approved(task.command),
			ports: task.ports.map((name) => ({ name, port: port(portKey(name)) })),
			href: url?.replace(PLACEHOLDER, (_, name: string) => String(port(portKey(name)))) ?? null
		})),
		setup: script(settings?.setup, approved),
		teardown: script(settings?.teardown, approved),
		sections: settings?.sections ?? [],
		ports: spareOf(assigned),
		problem,
		source,
		file
	};
}
