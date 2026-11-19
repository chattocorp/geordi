import { untrack } from 'svelte';

/** A field of a remote form, as far as a draft needs it. */
type Field = { value(): unknown; set(value: string): void };

/** What is written and attached, and not sent yet. Images are uploaded ones, by ID. */
type Saved = { text: string; images: string[] };

const prefix = 'geordi:draft:';

function read(key: string): Saved {
	try {
		const saved = JSON.parse(sessionStorage.getItem(prefix + key) ?? 'null');
		return { text: saved?.text ?? '', images: saved?.images ?? [] };
	} catch {
		return { text: '', images: [] };
	}
}

function write(key: string, saved: Saved) {
	try {
		if (saved.text || saved.images.length)
			sessionStorage.setItem(prefix + key, JSON.stringify(saved));
		else sessionStorage.removeItem(prefix + key);
	} catch {
		// storage unavailable: the draft lasts as long as the composer
	}
}

/**
 * Keeps what is written in `field`, and the images attached (bind a `MessageComposer`'s
 * `images` to `.images`), under `key` for as long as this window is open: leave the page,
 * come back, and it is all still there. A composer emptied (a form reset after sending)
 * forgets it; `clear()` does so for a form that navigates away instead. Both arguments are
 * functions, as they may change: one component may show one conversation after another.
 * Call during component setup.
 */
export function draft(key: () => string, field: () => Field, initial = () => '') {
	let images = $state.raw<string[]>([]);

	// what was left here last time comes back; text unless the field holds something already
	$effect(() => {
		const k = key();
		const f = field();
		untrack(() => {
			const saved = read(k);
			const text = saved.text || initial();
			if (text && !f.value()) f.set(text);
			images = saved.images;
		});
	});

	$effect(() => {
		const text = field().value();
		write(key(), { text: typeof text === 'string' ? text : '', images });
	});

	return {
		get images() {
			return images;
		},
		set images(next: string[]) {
			images = next;
		},
		clear: () => write(untrack(key), { text: '', images: [] })
	};
}
