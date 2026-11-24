export { duration } from '@geordi/ui/duration';
export { agentName } from '@geordi/ui/agents';

const relative = new Intl.RelativeTimeFormat('en');
const units = [
	['year', 365 * 24 * 60],
	['month', 30 * 24 * 60],
	['day', 24 * 60],
	['hour', 60],
	['minute', 1]
] as const;

export function relativeAge(at: string, now: number): string {
	const minutes = (now - Date.parse(at)) / 60_000;
	for (const [unit, size] of units) {
		if (minutes >= size) return relative.format(-Math.floor(minutes / size), unit);
	}
	return 'just now';
}
