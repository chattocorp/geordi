import { monitorEventLoopDelay } from 'node:perf_hooks';

/** A stall at least this long is worth a line in the log: everything the daemon does waited for it. */
const STALL_MS = 200;
const EVERY_MS = 10_000;

/**
 * Says in the log when the daemon's main thread was held up: while it is, no request is
 * answered and no agent's output relayed, and the forge only sees things take long.
 */
export function reportStalls(log: (line: string) => void = console.warn) {
	const delay = monitorEventLoopDelay({ resolution: 20 });
	delay.enable();
	const timer = setInterval(() => {
		const worst = delay.max / 1e6;
		if (worst >= STALL_MS) log(`[stall] the daemon was held up for ${Math.round(worst)} ms`);
		delay.reset();
	}, EVERY_MS);
	timer.unref();
	return () => {
		clearInterval(timer);
		delay.disable();
	};
}
