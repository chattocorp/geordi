import type { Command } from '#lib/commands.ts';
import type { WorkspaceAction } from '@geordi/ui/actions';

type Named = { name: string; label: string };

/** What a workspace has to go to, and what it can be asked to do. */
export type WorkspaceSource = {
	/** Its conversations, each a tab: its own agent's first. */
	conversations: { tab: string; label: string; icon: string; keywords?: string }[];
	/** Whether another conversation can be begun. */
	canBegin: boolean;
	/** Its terminals, if it can have any. */
	shells: { tab: string; title: string }[] | null;
	/** Whether the run shortcut does something. */
	canRunDefault: boolean;
	/** The repository's tasks: whether each is running, and its links where it has several. */
	tasks: (Named & { live: boolean; links: Named[] })[];
	/** Jobs whose output there is to read. */
	outputs: Named[];
	/** Its windows beside the conversation, those there are; none in a project. */
	windows: { tab: string; label: string; icon: string }[] | null;
	/** Whether the changes and terminals show, if they can be hidden. */
	sideOpen: boolean | null;
	changedFiles: string[];
	/** The next steps on offer. */
	actions: WorkspaceAction[];
	/** Whether it is locked against archiving (FDR-015); `null` where it can't be (un)locked. */
	locked: boolean | null;

	show(tab: string): void;
	newConversation(): void;
	/** Goes to a terminal, or opens one: whatever the terminal shortcut does. */
	terminal(): void;
	newTerminal(): void;
	runDefault(): void;
	/** Runs a task, or opens one of its links (`task.link`). */
	runTask(name: string): void;
	stop(task: string): void;
	showOutput(job: string): void;
	toggleSide(): void;
	openDiff(path: string): void;
	act(action: WorkspaceAction): void;
	lock(locked: boolean): void;
};

/** What can be done in a workspace: its command palette, and its shortcuts. */
export function workspaceCommands(at: WorkspaceSource): Command[] {
	const commands: Command[] = [];
	const add = (group: string, ...items: Omit<Command, 'group'>[]) =>
		commands.push(...items.map((item) => ({ ...item, group })));

	add(
		'Conversations',
		...at.conversations.map(({ tab, label, icon, keywords }) => ({
			id: tab,
			label,
			icon,
			keywords,
			run: () => at.show(tab)
		}))
	);
	if (at.canBegin)
		add('Conversations', {
			id: 'new-conversation',
			label: 'New conversation',
			icon: 'icon-[lucide--message-square-plus]',
			run: at.newConversation
		});

	if (at.shells) {
		// ahead of New terminal, which shows the same shortcut while there is no terminal yet
		add(
			'Terminals',
			{
				id: 'terminal',
				label: 'Terminal',
				shortcut: 'terminal',
				unlisted: true,
				run: at.terminal
			},
			...at.shells.map(({ tab, title }) => ({
				id: tab,
				label: title,
				icon: 'icon-[lucide--square-terminal]',
				run: () => at.show(tab)
			})),
			{
				id: 'new-terminal',
				label: 'New terminal',
				icon: 'icon-[lucide--square-plus]',
				shortcut: at.shells.length ? undefined : 'terminal',
				run: at.newTerminal
			}
		);
	}

	if (at.canRunDefault)
		add('Tasks', {
			id: 'run-default',
			label: 'Run default tasks',
			icon: 'icon-[lucide--play]',
			shortcut: 'runDefault',
			run: at.runDefault
		});
	add(
		'Tasks',
		...at.tasks.flatMap(({ name, label, live, links }) => [
			live
				? {
						id: `stop:${name}`,
						label: `Stop ${label}`,
						icon: 'icon-[lucide--square]',
						run: () => at.stop(name)
					}
				: {
						id: `task:${name}`,
						label: `Run ${label}`,
						icon: 'icon-[lucide--play]',
						run: () => at.runTask(name)
					},
			...links.map((link) => ({
				id: `link:${name}.${link.name}`,
				label: `Open ${link.label}`,
				icon: 'icon-[lucide--external-link]',
				run: () => at.runTask(`${name}.${link.name}`)
			}))
		])
	);
	add(
		'Tasks',
		...at.outputs.map(({ name, label }) => ({
			id: `output:${name}`,
			label: `Output of ${label}`,
			icon: 'icon-[lucide--scroll-text]',
			run: () => at.showOutput(name)
		}))
	);

	add(
		'Windows',
		...(at.windows ?? []).map(({ tab, label, icon }) => ({
			id: tab,
			label,
			icon,
			run: () => at.show(tab)
		}))
	);
	if (at.sideOpen !== null)
		add('Windows', {
			id: 'toggle-side',
			label: at.sideOpen ? 'Hide right sidebar' : 'Show right sidebar',
			keywords: 'changes terminals',
			icon: at.sideOpen ? 'icon-[lucide--panel-right-close]' : 'icon-[lucide--panel-right-open]',
			shortcut: 'toggleSide',
			run: at.toggleSide
		});

	add(
		'Changed files',
		...at.changedFiles.map((path) => ({
			id: `diff:${path}`,
			label: path.split('/').at(-1) ?? path,
			icon: 'icon-[lucide--file-diff]',
			detail: path.split('/').slice(0, -1).join('/') || undefined,
			keywords: path,
			run: () => at.openDiff(path)
		}))
	);

	add(
		'Next steps',
		...at.actions.map((action) => ({
			id: `action:${action.id}`,
			label: action.label,
			icon: action.icon,
			run: () => at.act(action)
		}))
	);
	if (at.locked !== null)
		add('Workspace', {
			id: 'lock',
			label: at.locked ? 'Unlock workspace' : 'Lock workspace',
			keywords: 'archive keep',
			icon: at.locked ? 'icon-[lucide--lock-open]' : 'icon-[lucide--lock]',
			run: () => at.lock(!at.locked)
		});
	return commands;
}
