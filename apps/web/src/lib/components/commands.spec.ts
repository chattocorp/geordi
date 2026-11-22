import { expect, it, vi } from 'vitest';
import { runShortcut, type Command } from '#lib/commands.ts';
import { globalCommands, type Everywhere } from './commands.ts';
import { workspaceCommands, type WorkspaceSource } from './workspace/commands.ts';
import type { Navigation } from '#lib/server/views.ts';

// Cmd on a Mac, Ctrl elsewhere: wherever the tests run
const mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
const key = (code: string, init: KeyboardEventInit = {}) =>
	({
		code,
		key: code.replace(/^Key/, '').toLowerCase(),
		ctrlKey: !mac,
		metaKey: mac,
		shiftKey: false,
		altKey: false,
		repeat: false,
		isComposing: false,
		target: null,
		preventDefault: vi.fn(),
		...init
	}) as unknown as KeyboardEvent;

const command = (id: string, extra: Partial<Command> = {}): Command => ({
	id,
	label: id,
	group: 'General',
	run: vi.fn(),
	...extra
});

it('runs the command whose shortcut was pressed, once while held unless it repeats', () => {
	const sidebar = command('sidebar', { shortcut: 'toggleSidebar' });
	const next = command('next', { shortcut: 'nextWorkspace', repeats: true });
	const commands = [command('plain'), sidebar, next];

	expect(runShortcut(key('KeyB'), commands)).toBe(true);
	expect(runShortcut(key('KeyB', { repeat: true }), commands)).toBe(true);
	expect(sidebar.run).toHaveBeenCalledTimes(1);

	runShortcut({ ...key('BracketRight', { repeat: true }), key: ']' } as KeyboardEvent, commands);
	expect(next.run).toHaveBeenCalledTimes(1);

	expect(runShortcut(key('KeyQ'), commands)).toBe(false);
});

const nav = {
	repos: [
		{ id: 'a', name: 'Alpha', workspaceCount: 1 },
		{ id: 'b', name: 'Beta', workspaceCount: 1 }
	],
	workspaces: [
		{ id: 'old', title: 'Old', repoId: 'a', branch: 'x' },
		{ id: 'new', title: 'New', repoId: 'b', branch: 'y' }
	]
} as unknown as Navigation;

const everywhere = (at: Partial<Everywhere> = {}): Everywhere =>
	new Proxy(
		{
			nav,
			viewed: null,
			recency: [],
			anyUnread: false,
			sidebarOpen: true,
			wide: true,
			grouped: true,
			todayOnly: false,
			focus: null,
			theme: 'system',
			sections: [],
			...at
		} as Everywhere,
		{ get: (target, name) => (name in target ? target[name as keyof Everywhere] : vi.fn()) }
	);

it('lists workspaces in the order given, without the one on screen', () => {
	const listed = globalCommands(everywhere({ viewed: 'old', recency: ['new', 'old'] }))
		.filter((command) => command.group === 'Workspaces')
		.map((command) => [command.label, command.detail]);
	expect(listed).toEqual([['New', 'Beta']]);
	expect(
		globalCommands(everywhere({ recency: ['new', 'old'] }))
			.filter((command) => command.group === 'Workspaces')
			.map((command) => command.label)
	).toEqual(['New', 'Old']);
});

it('gives the focus shortcut to the repository on screen, or to showing all again', () => {
	const focusing = (at: Partial<Everywhere>) =>
		globalCommands(everywhere(at)).find((command) => command.shortcut === 'focusRepo')?.id;
	expect(focusing({ viewed: 'old' })).toBe('focus:a');
	expect(focusing({ viewed: 'old', focus: 'a' })).toBe('focus:all');
	expect(focusing({ viewed: null, focus: 'b' })).toBe('focus:all');
	expect(focusing({ viewed: null })).toBeUndefined();
});

it('lists the repositories with workspaces by name, saying which is shown alone', () => {
	const repos = (at: Partial<Everywhere>) =>
		globalCommands(everywhere(at))
			.filter((command) => command.group === 'Repositories')
			.map((command) => [command.label, command.detail]);
	const many = {
		...nav,
		repos: [
			{ id: 'z', name: 'zeta', workspaceCount: 2 },
			{ id: 'e', name: 'Empty', workspaceCount: 0 },
			{ id: 'a', name: 'Alpha', workspaceCount: 1 }
		]
	} as unknown as Navigation;
	expect(repos({ nav: many })).toEqual([
		['Alpha', undefined],
		['zeta', undefined]
	]);
	expect(repos({ nav: many, focus: 'z' })).toEqual([
		['Alpha', undefined],
		['zeta', 'Shown alone']
	]);
});

const workspace = (at: Partial<WorkspaceSource> = {}): WorkspaceSource =>
	new Proxy(
		{
			conversations: [],
			canBegin: true,
			shells: [],
			canRunDefault: false,
			tasks: [],
			outputs: [],
			windows: [],
			sideOpen: true,
			changedFiles: [],
			actions: [],
			locked: null,
			...at
		} as WorkspaceSource,
		{ get: (target, name) => (name in target ? target[name as keyof WorkspaceSource] : vi.fn()) }
	);

it('goes to a terminal by shortcut, and only lists what is there', () => {
	const commands = workspaceCommands(workspace({ shells: [{ tab: 'terminal:1', title: 'zsh' }] }));
	expect(commands.find((command) => command.shortcut === 'terminal')?.id).toBe('terminal');
	expect(commands.filter((command) => command.unlisted).map((command) => command.id)).toEqual([
		'terminal'
	]);
	expect(workspaceCommands(workspace({ shells: null })).some((c) => c.id === 'terminal')).toBe(
		false
	);
});

it('lists changed files by name, with their folder beside them', () => {
	const [file] = workspaceCommands(workspace({ changedFiles: ['src/lib/a.ts'] })).filter(
		(command) => command.group === 'Changed files'
	);
	expect([file.label, file.detail, file.keywords]).toEqual(['a.ts', 'src/lib', 'src/lib/a.ts']);
});

it('runs a task or stops it, and opens one that is only a URL', () => {
	const runTask = vi.fn();
	const commands = workspaceCommands(
		workspace({
			runTask,
			tasks: [
				{ name: 'web', label: 'Web server', live: true, opens: false },
				{ name: 'storybook', label: 'Storybook', live: false, opens: false },
				{ name: 'docs', label: 'Docs', live: false, opens: true }
			]
		})
	);
	const tasks = commands.filter((command) => command.group === 'Tasks');
	expect(tasks.map(({ label }) => label)).toEqual([
		'Stop Web server',
		'Run Storybook',
		'Open Docs'
	]);
	tasks[2].run();
	expect(runTask).toHaveBeenCalledWith('docs');
});
