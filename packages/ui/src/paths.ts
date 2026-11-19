/** A path made to fit a number of columns: its directories, and its file's name. */
export type FittedPath = { dirs: string[]; name: string };

/**
 * A directory's name shortened to its first letter, keeping what wraps it:
 * `components` → `c`, `[serverId]` → `[s]`, `(app)` → `(a)`, `.github` → `.g`.
 */
export function initial(dir: string): string {
	const [, lead, first, rest] = dir.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]?)(.*)$/su)!;
	const trail = rest.match(/[^\p{L}\p{N}]*$/u)![0];
	const short = lead + first + trail;
	return short.length < dir.length ? short : dir;
}

const width = ({ dirs, name }: FittedPath) =>
	dirs.reduce((sum, dir) => sum + dir.length + 1, name.length);

/**
 * `path` shortened until it fits in `columns` characters, a step at a time: the directories
 * become their first letters, the outermost first (`a/f/s/lib/MessageView.svelte`); then they
 * give way to an ellipsis, also from the outside (`…/l/MessageView.svelte`); and then only the
 * name is left, for whoever shows it to cut short.
 */
export function fitPath(path: string, columns: number): FittedPath {
	const dirs = path.split('/');
	const name = dirs.pop()!;
	const fitted = { dirs, name };
	if (width(fitted) <= columns) return fitted;

	for (let i = 0; i < dirs.length; i++) {
		dirs[i] = initial(dirs[i]);
		if (width(fitted) <= columns) return fitted;
	}

	while (dirs.length > 0) {
		dirs.splice(0, dirs[0] === '…' ? 2 : 1, '…');
		if (width(fitted) <= columns) return fitted;
		if (dirs.length === 1) break;
	}

	return { dirs: [], name };
}
