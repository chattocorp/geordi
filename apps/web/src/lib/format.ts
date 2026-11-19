export { agentName } from '@geordi/ui/agents';

/** "just now", "5 min ago", "3 h ago", or a date. */
export function timeAgo(iso: string, now = Date.now()): string {
	const minutes = Math.round((now - Date.parse(iso)) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
	return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** How long something took, to the unit that matters: "4s", "2m 14s", "1h 3m". */
export function duration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
