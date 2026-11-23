/**
 * A value remembered in this browser's localStorage. Starts as `initial` (also during
 * server rendering) and picks up the stored value once mounted. Call during component setup.
 */
export function persisted<T>(key: string, initial: T) {
	let value = $state.raw(initial);

	$effect(() => {
		try {
			const stored = localStorage.getItem(key);
			if (stored !== null) value = JSON.parse(stored);
		} catch {
			// storage unavailable or corrupt: keep the initial value
		}
	});

	return {
		get current() {
			return value;
		},
		set current(next: T) {
			value = next;
			try {
				localStorage.setItem(key, JSON.stringify(next));
			} catch {
				// storage unavailable (private mode): the value lasts for this page only
			}
		}
	};
}
