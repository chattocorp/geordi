import type { TurnUsage } from '@geordi/protocol';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 2 });
const exact = new Intl.NumberFormat('en');

/** What a reply used, in short: "150K tokens". */
export function tokenSummary(usage: TurnUsage) {
	return `${compact.format(usage.totalTokens)} tokens`;
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
