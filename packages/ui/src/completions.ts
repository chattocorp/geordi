import type { FileMatch } from '@geordi/protocol';
import { fuzzySegments } from '@geordi/protocol/fuzzy';

/** Something the text can begin with, offered as one types: `/review`, say. */
export type Completion = {
	/** What goes into the text, a space after it: it begins with `/`. */
	text: string;
	description?: string;
	/** What is to follow it, if anything. */
	hint?: string;
	file?: { name: ReturnType<typeof fuzzySegments>; directory: ReturnType<typeof fuzzySegments> };
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
	const match = /(?:^|\s)@([^\s@]+)$/.exec(text.slice(0, caret));
	if (!match) return null;
	const query = match[1];
	return {
		query,
		start: caret - query.length - 1,
		end: caret + /^\S*/.exec(text.slice(caret))![0].length
	};
}

export function fileCompletion({ path, indices }: FileMatch): Completion {
	const split = path.lastIndexOf('/') + 1;
	return {
		text: path,
		file: {
			name: fuzzySegments(
				path.slice(split),
				indices.map((i) => i - split)
			),
			directory: fuzzySegments(path.slice(0, Math.max(0, split - 1)), indices)
		}
	};
}
