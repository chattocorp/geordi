/**
 * Fuzzy matching for pick lists: the query's characters have to appear in the text in
 * order, not next to each other ("g6l" finds "GPT-6-Luna").
 */

export type FuzzyMatch = {
	/** Higher is better: runs of characters and starts of words count for more. */
	score: number;
	/** Where in the text the query's characters were found. */
	indices: number[];
};

const startsWord = (text: string, index: number) =>
	index === 0 || !/[a-z0-9]/.test(text[index - 1]);

/** How `query` matches `text`, or `null` if it doesn't. Case and spaces in the query don't matter. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
	const wanted = query.toLowerCase().replace(/\s+/g, '');
	const given = text.toLowerCase();
	if (!wanted) return { score: 0, indices: [] };

	// Try every place the first character occurs, take the rest as early as it comes, and
	// keep the best attempt.
	let best: FuzzyMatch | null = null;
	for (
		let start = given.indexOf(wanted[0]);
		start !== -1;
		start = given.indexOf(wanted[0], start + 1)
	) {
		const indices = [start];
		let score = startsWord(given, start) ? 3 : 0;
		for (let i = 1; i < wanted.length; i++) {
			const last = indices[i - 1];
			const next = given.indexOf(wanted[i], last + 1);
			if (next === -1) break;
			score += next === last + 1 ? 2 : startsWord(given, next) ? 1.5 : 0;
			score -= (next - last - 1) * 0.1;
			indices.push(next);
		}
		if (indices.length === wanted.length && (!best || score > best.score))
			best = { score, indices };
	}
	return best;
}

/**
 * The items that match, the best first; equally good ones keep their order. Each item is
 * matched by its `text`, or failing that by `also` (an ID, say).
 */
export function fuzzyFilter<T>(
	query: string,
	items: T[],
	text: (item: T) => string,
	also: (item: T) => string | undefined = () => undefined
): { item: T; indices: number[] }[] {
	return items
		.flatMap((item, order) => {
			const match = fuzzyMatch(query, text(item));
			if (match) return [{ item, order, ...match }];
			const other = also(item);
			// found by its other name: nothing to point out in the text, and it ranks below
			return other && fuzzyMatch(query, other) ? [{ item, order, score: -1000, indices: [] }] : [];
		})
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.map(({ item, indices }) => ({ item, indices }));
}

/** `text` cut into runs that were matched (`hit`) and runs that weren't, for highlighting. */
export function fuzzySegments(text: string, indices: number[]): { text: string; hit: boolean }[] {
	const segments: { text: string; hit: boolean }[] = [];
	for (let i = 0; i < text.length; i++) {
		const hit = indices.includes(i);
		const last = segments.at(-1);
		if (last?.hit === hit) last.text += text[i];
		else segments.push({ text: text[i], hit });
	}
	return segments;
}
