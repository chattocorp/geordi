/**
 * Geordi's keyboard shortcuts, all in one place: what each is pressed with, and what it is
 * called (the settings list them). Every one goes with Cmd on a Mac and Ctrl elsewhere.
 */
type Combo = {
	/** The physical key (`KeyN`), for letters: the same place on every layout. */
	code?: string;
	/** The character (`[`), for punctuation: wherever the layout has it, Option or not. */
	key?: string;
	shift?: boolean;
	alt?: boolean;
};

export type Shortcut = Combo & { label: string; group: string };

export const shortcuts = {
	newWorkspace: { code: 'KeyN', label: 'New workspace', group: 'General' },
	newWorkspaceIn: {
		code: 'KeyN',
		shift: true,
		label: 'New workspace, choosing its repository',
		group: 'General'
	},
	previousWorkspace: { key: '[', label: 'Previous workspace', group: 'General' },
	nextWorkspace: { key: ']', label: 'Next workspace', group: 'General' },
	nextUnreadWorkspace: {
		code: 'Enter',
		shift: true,
		label: 'Next unread workspace',
		group: 'General'
	},
	filterSidebar: { key: '/', shift: true, label: 'Filter the sidebar', group: 'General' },
	focusRepo: {
		code: 'KeyF',
		shift: true,
		label: 'Show only the repository of this workspace, or all again',
		group: 'General'
	},
	todayOnly: {
		code: 'KeyT',
		shift: true,
		label: 'Toggle workspaces active today (experimental)',
		group: 'General'
	},
	toggleSidebar: { code: 'KeyB', label: 'Toggle the sidebar', group: 'General' },
	settings: { key: ',', label: 'Open the settings', group: 'General' },
	toggleSide: {
		code: 'KeyB',
		alt: true,
		label: 'Toggle changes and terminals',
		group: 'Workspace'
	},
	runDefault: {
		code: 'KeyR',
		alt: true,
		label: 'Run the default job, or open the default link',
		group: 'Workspace'
	},
	queue: { key: 'Enter', label: 'Queue a message for when the agent is done', group: 'Workspace' },
	model: { code: 'KeyM', shift: true, label: 'Choose the model', group: 'Workspace' },
	effort: { code: 'KeyE', shift: true, label: 'Choose the effort', group: 'Workspace' }
} satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof shortcuts;

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Whether a key press is the shortcut `id`. Not while typing in a terminal with Ctrl
 * (elsewhere than on a Mac): there, Ctrl and a key belong to the shell.
 */
export function pressed(event: KeyboardEvent, id: ShortcutId): boolean {
	const shortcut: Shortcut = shortcuts[id];
	const mac = isMac();
	if (event.isComposing || event.shiftKey !== !!shortcut.shift) return false;
	if (!(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return false;
	const key = id === 'filterSidebar' && event.key === '?' ? '/' : event.key;
	if (shortcut.code ? event.code !== shortcut.code : key !== shortcut.key) return false;
	// a character may take Option to type (`[` on a German Mac): only letters care about Alt
	if (shortcut.code && event.altKey !== !!shortcut.alt) return false;
	return mac || !(event.target as Element | null)?.closest?.('.xterm');
}

/** How a shortcut is written, as people know it on their platform: `⌥⌘B`, `Ctrl+Alt+B`. */
export function hint(id: ShortcutId): string {
	const shortcut: Shortcut = shortcuts[id];
	const key = shortcut.code?.replace(/^Key/, '') ?? shortcut.key ?? '';
	if (isMac()) return `${shortcut.alt ? '⌥' : ''}${shortcut.shift ? '⇧' : ''}⌘${key}`;
	return ['Ctrl', shortcut.alt && 'Alt', shortcut.shift && 'Shift', key].filter(Boolean).join('+');
}

/** The shortcuts by group, in the order they are defined, for listing. */
export const shortcutGroups = () =>
	Map.groupBy(
		Object.entries(shortcuts) as [ShortcutId, Shortcut][],
		([, shortcut]) => shortcut.group
	);

/** Textarea keydown handler: Enter submits the form, Shift+Enter inserts a newline. */
export function submitOnEnter(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
	if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	event.currentTarget.form?.requestSubmit();
}

/** The model and effort shortcuts, for the composer in use: with several on screen, the one typed in. */
export const modelShortcut = (event: KeyboardEvent, at: Element) =>
	pressed(event, 'model') && inSameForm(event, at);
export const effortShortcut = (event: KeyboardEvent, at: Element) =>
	pressed(event, 'effort') && inSameForm(event, at);

const inSameForm = (event: KeyboardEvent, at: Element) =>
	!!at.closest('form')?.contains(event.target as Node | null);
