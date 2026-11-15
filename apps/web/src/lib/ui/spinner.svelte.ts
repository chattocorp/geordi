/** The frames of the spinner: the classic Braille dots going round. */
export const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Which frame every spinner shows: they share one clock, so they turn together. */
export const clock = $state({ frame: 0 });

let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Keeps the clock running while the calling component is on screen. Call during component
 * setup. People who prefer reduced motion get a spinner that stands still.
 */
export function useClock() {
	$effect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (users++ === 0)
			timer = setInterval(() => (clock.frame = (clock.frame + 1) % FRAMES.length), 80);
		return () => {
			if (--users === 0) clearInterval(timer);
		};
	});
}
