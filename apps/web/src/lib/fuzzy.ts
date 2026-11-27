import { fuzzyMatch } from '@geordi/protocol/fuzzy';
export { fuzzyMatch, fuzzySegments } from '@geordi/protocol/fuzzy';

/**
 * The items that match, the best first. Each item is matched by its `text`, or failing
 * that by `also` (an ID, say), which ranks below every match by text. Of equally good
 * matches the one that starts earlier comes first, then the shorter text ("Geordi" before
 * "Geordi blog post" before "Plan Geordi"), then the one that was first in `items`.
 * Matches less than half as good as the best are left out: letters scattered over a long
 * text are noise next to a word that was found whole.
 */
export function fuzzyFilter<T>(
	query: string,
	items: T[],
	text: (item: T) => string,
	also: (item: T) => string | undefined = () => undefined
): { item: T; indices: number[] }[] {
	if (!query.trim()) return items.map((item) => ({ item, indices: [] }));
	const found = items.flatMap((item, order) => {
		const own = text(item);
		const match = fuzzyMatch(query, own);
		const rank = { item, order, start: match?.indices[0] ?? 0, length: own.length };
		if (match) return [{ ...rank, ...match, byText: true }];
		const other = also(item);
		const second = other ? fuzzyMatch(query, other) : null;
		// found by its other name: nothing to point out in the text
		return second ? [{ ...rank, score: second.score, indices: [], byText: false }] : [];
	});
	const best = Math.max(0, ...found.map(({ score }) => score));
	return found
		.filter(({ score }) => score >= best / 2)
		.sort(
			(a, b) =>
				Number(b.byText) - Number(a.byText) ||
				b.score - a.score ||
				a.start - b.start ||
				a.length - b.length ||
				a.order - b.order
		)
		.map(({ item, indices }) => ({ item, indices }));
}
