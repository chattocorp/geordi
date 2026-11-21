import { pressed, type ShortcutId } from '@geordi/ui/keys';

/**
 * Something to do: listed in a command palette, and done by its keyboard shortcut. Each
 * shortcut is handled by the command that carries it (`runShortcut`), so what a palette
 * offers and what the keyboard does are one and the same.
 */
export type Command = {
	/** Unique among the commands. */
	id: string;
	label: string;
	/** The heading it is listed under, while nothing is typed. */
	group: string;
	/** An Iconify class. */
	icon?: string;
	/** Where it is, or whose: said quietly beside it (a repository, a folder). */
	detail?: string;
	/** Other words to find it by, not shown. */
	keywords?: string;
	shortcut?: ShortcutId;
	/** Done again while its shortcut is held down. */
	repeats?: boolean;
	/** Only a shortcut: not listed in the palette. */
	unlisted?: boolean;
	run: () => void;
};

/** Does the first command whose shortcut this is; says whether there was one. */
export function runShortcut(event: KeyboardEvent, commands: Command[]): boolean {
	const command = commands.find(({ shortcut }) => shortcut && pressed(event, shortcut));
	if (!command) return false;
	event.preventDefault();
	if (!event.repeat || command.repeats) command.run();
	return true;
}
