/**
 * What stands for a repository that has no picture of itself: the first letter of its name
 * (of `geordi` in `hmans/geordi`).
 */
export function monogram(name: string): string {
	const letter = (name.split('/').pop() ?? '').match(/[\p{L}\p{N}]/u)?.[0];
	return (letter ?? '?').toUpperCase();
}

/** How many tints there are (`--tint-0` to `--tint-5` in `layout.css`). */
const TINTS = 6;

/**
 * Which tint a repository's monogram has: chosen by its ID, so that it stays the same
 * (through a rename too) and needs nothing stored.
 */
export function tint(id: string): number {
	let hash = 2166136261; // FNV-1a
	for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
	return (hash >>> 0) % TINTS;
}
