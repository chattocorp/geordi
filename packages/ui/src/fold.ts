import { prefersReducedMotion } from 'svelte/motion';
import { slide } from 'svelte/transition';

/** Slide a group shut or open when its disclosure is toggled. */
export function foldSlide(node: HTMLElement, enabled = true) {
	return enabled && !prefersReducedMotion.current
		? slide(node, { duration: 200 })
		: { duration: 0 };
}
