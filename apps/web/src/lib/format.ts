export { duration } from '@geordi/ui/duration';
export { agentName } from '@geordi/ui/agents';

/** "just now", "5 min ago", "3 h ago", or a date. */
export function timeAgo(iso: string, now = Date.now()): string {
	const minutes = Math.round((now - Date.parse(iso)) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
	return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
