/** Something the text can begin with, offered as one types: `/review`, say. */
export type Completion = {
	/** What goes into the text, a space after it: it begins with `/`. */
	text: string;
	description?: string;
	/** What is to follow it, if anything. */
	hint?: string;
};

/**
 * What the text asks to complete: what follows its `/`, while it is nothing but a slash and
 * a word. `null` when it asks for nothing.
 */
export const completionQuery = (text: string): string | null =>
	/^\/\S*$/.test(text) ? text.slice(1) : null;

/** The word a completion is known by: its text without the `/` (or the `$`) before it. */
const nameOf = (completion: Completion) =>
	completion.text.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();

/**
 * The completions that match a query: those beginning with it first, then those with a word
 * beginning with it (`code-review`, `plugin:review`), then those containing it.
 */
export function matching<T extends Completion>(completions: T[], query: string): T[] {
	const wanted = query.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
	const tiers: T[][] = [[], [], []];
	for (const completion of completions) {
		const name = nameOf(completion);
		if (name.startsWith(wanted)) tiers[0].push(completion);
		else if (name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(wanted)))
			tiers[1].push(completion);
		else if (name.includes(wanted)) tiers[2].push(completion);
	}
	return tiers.flat();
}

/** The @ token under a collapsed caret, including the part after the caret. */
export function fileMention(text: string, caret: number) {
	const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
	if (!match) return null;
	const query = match[1];
	return {
		query,
		start: caret - query.length - 1,
		end: caret + /^\S*/.exec(text.slice(caret))![0].length
	};
}

export function matchingFiles(paths: string[], query: string): Completion[] {
	const wanted = query.toLowerCase();
	const tiers: string[][] = [[], [], []];
	for (const path of paths) {
		const lower = path.toLowerCase();
		if (!lower.includes(wanted)) continue;
		const name = lower.slice(lower.lastIndexOf('/') + 1);
		const tier = tiers[name === wanted ? 0 : name.startsWith(wanted) ? 1 : 2];
		if (tier.length < 40) tier.push(path);
	}
	return tiers
		.flat()
		.slice(0, 40)
		.map((text) => ({ text }));
}

/** Split the visible part of a path into plain text and literal query matches. A match
 * can cross the slash between the directory and the file name. */
export function fileSegments(path: string, query: string, start = 0, end = path.length) {
	const parts: { text: string; hit: boolean }[] = [];
	let cursor = start;
	if (query) {
		const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		for (const match of path.matchAll(new RegExp(literal, 'gi'))) {
			const from = Math.max(start, match.index);
			const to = Math.min(end, match.index + match[0].length);
			if (from >= to) continue;
			if (cursor < from) parts.push({ text: path.slice(cursor, from), hit: false });
			parts.push({ text: path.slice(from, to), hit: true });
			cursor = to;
		}
	}
	if (cursor < end) parts.push({ text: path.slice(cursor, end), hit: false });
	return parts;
}
