import type { Agent, UsageLimit } from '@geordi/protocol';

export type Limits = Partial<Record<Agent, UsageLimit[]>>;

/**
 * The usage limits of the subscriptions the agents run on, once per agent, as the latest of
 * their sessions said (ADR-003: live data, in memory only). They are the account's, not a
 * workspace's: what any workspace's agent says stands for all that run on the same agent.
 * What a session said earlier than what is known (an idle one, reported again by a
 * reconnecting daemon) is passed over. A limit that has started over since is no longer
 * known, until an agent says it again: it is left out, from the moment it resets.
 */
export function createLimits() {
	const now = () => Date.now();
	let known: Limits = {};
	const said: Partial<Record<Agent, number>> = {};
	const listeners = new Set<() => void>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const current = (limit: UsageLimit) => limit.resetsAt === undefined || limit.resetsAt > now();
	const changed = () => {
		for (const listener of listeners) listener();
	};
	/** Tells again when the next limit resets, so that it is left out from then. */
	function schedule() {
		clearTimeout(timer);
		const next = Math.min(
			...Object.values(known)
				.flat()
				.filter(current)
				.map((limit) => limit.resetsAt ?? Infinity)
		);
		if (next === Infinity) return;
		timer = setTimeout(
			() => {
				changed();
				schedule();
			},
			Math.min(next - now(), 2 ** 31 - 1)
		);
		timer.unref?.();
	}

	return {
		read: (): Limits =>
			Object.fromEntries(
				Object.entries(known)
					.map(([agent, limits]) => [agent, limits.filter(current)] as const)
					.filter(([, limits]) => limits.length)
			),
		/** `at`: when the agent said them; now, where its daemon doesn't say. */
		note(agent: Agent, limits: UsageLimit[], at = now()) {
			if (at < (said[agent] ?? -Infinity)) return;
			said[agent] = at;
			if (JSON.stringify(known[agent]) === JSON.stringify(limits)) return;
			known = { ...known, [agent]: limits };
			changed();
			schedule();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
