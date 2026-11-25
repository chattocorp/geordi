import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion, Tween } from 'svelte/motion';

/** Visible fraction of a sidebar. Only toggling it animates its size. */
export function sidebarMotion(open: () => boolean) {
	return Tween.of(() => Number(open()), {
		get duration() {
			return prefersReducedMotion.current ? 0 : 180;
		},
		easing: cubicOut
	});
}
