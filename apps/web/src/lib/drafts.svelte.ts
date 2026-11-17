import { untrack } from 'svelte';

/** A field of a remote form, as far as a draft needs it. */
type Field = { value(): unknown; set(value: string): void };

const prefix = 'geordi:draft:';

function read(key: string) {
	try {
		return sessionStorage.getItem(prefix + key) ?? '';
	} catch {
		return '';
	}
}

function write(key: string, text: string) {
	try {
		if (text) sessionStorage.setItem(prefix + key, text);
		else sessionStorage.removeItem(prefix + key);
	} catch {
		// storage unavailable: the draft lasts as long as the field
	}
}

/**
 * Keeps what is written in `field` and not sent yet under `key`, for as long as this
 * window is open: leave the page, come back, and it is still there. A field emptied (a
 * form reset after sending) forgets it; `clear()` does so for a form that navigates away
 * instead. Both arguments are functions, as they may change: one component may show one
 * conversation after another. Call during component setup.
 */
export function draft(key: () => string, field: () => Field) {
	// what was left here last time comes back, unless the field holds something already
	$effect(() => {
		const k = key();
		const f = field();
		untrack(() => {
			const saved = read(k);
			if (saved && !f.value()) f.set(saved);
		});
	});

	$effect(() => {
		const text = field().value();
		write(key(), typeof text === 'string' ? text : '');
	});

	return {
		clear: () => write(untrack(key), '')
	};
}
