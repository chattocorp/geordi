import { fuzzyMatch } from '@geordi/protocol/fuzzy';
export { fuzzyMatch } from '@geordi/protocol/fuzzy';

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
