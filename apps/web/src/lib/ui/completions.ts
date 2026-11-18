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
