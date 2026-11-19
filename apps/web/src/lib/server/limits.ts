import type { Agent, UsageLimit } from '@geordi/protocol';

export type Limits = Partial<Record<Agent, UsageLimit[]>>;

/**
 * The usage limits of the subscriptions the agents run on, as the latest of their sessions
 * said (ADR-003: live data, in memory only). They are the account's, not a workspace's:
 * what any workspace's agent says stands for all that run on the same agent.
 */
export function createLimits() {
	let known: Limits = {};
	const listeners = new Set<() => void>();
	return {
		read: () => known,
		note(agent: Agent, limits: UsageLimit[]) {
			if (JSON.stringify(known[agent]) === JSON.stringify(limits)) return;
			known = { ...known, [agent]: limits };
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
