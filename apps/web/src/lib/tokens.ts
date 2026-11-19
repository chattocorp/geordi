import type { ContextUsage, TurnUsage } from '@geordi/protocol';

const exact = new Intl.NumberFormat('en');

/** A token count the way people say it: 31k, 1M, 1.5M. */
export function tokens(count: number): string {
	if (count >= 1_000_000) return `${+(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
	return String(count);
}

/** What a reply used, in short: "150k tokens". */
export function tokenSummary(usage: TurnUsage) {
	return `${tokens(usage.totalTokens)} tokens`;
}

/** Every count the agent gave, for a closer look. */
export function tokenBreakdown(usage: TurnUsage) {
	const counts: [string, number | undefined][] = [
		['input', usage.inputTokens],
		['output', usage.outputTokens],
		['reasoning', usage.thoughtTokens],
		['cache read', usage.cachedReadTokens],
		['cache write', usage.cachedWriteTokens]
	];
	return counts
		.filter(([, count]) => count)
		.map(([name, count]) => `${exact.format(count!)} ${name}`)
		.join(' · ');
}

/** From how full a context is on, it is shown as a warning: the agent will soon compact it. */
export const NEARLY_FULL = 0.9;

/** How full an agent's context is, in words: "31k of 1M tokens · $0.27". */
export function describeUsage({ used, size, cost }: ContextUsage): string {
	const words = `${tokens(used)} of ${tokens(size)} tokens`;
	if (!cost) return words;
	const amount = new Intl.NumberFormat('en', { style: 'currency', currency: cost.currency }).format(
		cost.amount
	);
	return `${words} · ${amount}`;
}

/** The share of the context in use, from 0 to 1. */
export const fullness = ({ used, size }: ContextUsage) =>
	size > 0 ? Math.min(1, Math.max(0, used / size)) : 0;
