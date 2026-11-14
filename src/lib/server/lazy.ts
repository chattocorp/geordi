/** Creates `fn`'s value on first call and returns it from then on. */
export function lazy<T>(fn: () => T): () => T {
	let value: { current: T } | undefined;
	return () => (value ??= { current: fn() }).current;
}
