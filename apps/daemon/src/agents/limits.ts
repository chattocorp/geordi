/**
 * The usage limits of the subscription an agent runs on, as its wrapper passes them on in
 * a `usage_update`'s `_meta`: Claude's `rate_limit_event` (`_claude/rateLimit`), Codex's
 * rate limit snapshots (`codex/rateLimits`, added by our patch of codex-acp). What they
 * say is theirs, not an interface: the parsers take what they recognise, and leave the rest.
 */
import type { UsageLimit } from '@geordi/protocol';

/** Used this much, a limit is close, where the provider says nothing of its own. */
const WARNING_PERCENT = 80;

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
const number = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const statusOf = (percent: number | undefined, warning: boolean): UsageLimit['status'] =>
	percent !== undefined && percent >= 100 ? 'limited' : warning ? 'warning' : 'ok';

/** A window's length, for people: `5h`, `Week`, `3d`. */
function windowName(minutes: number | undefined): string {
	if (minutes === undefined) return 'Limit';
	if (minutes === 7 * 24 * 60) return 'Week';
	if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
	if (minutes % 60 === 0) return `${minutes / 60}h`;
	return `${minutes}m`;
}

const CLAUDE_WINDOWS: Record<string, string> = {
	five_hour: '5h',
	seven_day: 'Week',
	seven_day_fable: 'Week (Fable)',
	seven_day_opus: 'Week (Opus)',
	seven_day_sonnet: 'Week (Sonnet)',
	seven_day_haiku: 'Week (Haiku)'
};

/** Claude's `rate_limit_event` info (`SDKRateLimitInfo`), as limits: all of its windows. */
export function claudeLimits(info: unknown): UsageLimit[] {
	const windows = record(record(info)?.unifiedWindows);
	if (!windows) return [];
	return Object.entries(windows).flatMap(([key, value]): UsageLimit[] => {
		const window = record(value);
		if (!window) return [];
		const utilization = number(window.utilization);
		const percent = utilization === undefined ? undefined : utilization * 100;
		const resets = number(window.resetsAt);
		return [
			{
				name: CLAUDE_WINDOWS[key] ?? key.replaceAll('_', ' '),
				...(percent !== undefined && { usedPercent: percent }),
				...(resets !== undefined && { resetsAt: resets * 1000 }),
				status:
					window.status === 'rejected'
						? 'limited'
						: statusOf(percent, window.status === 'allowed_warning')
			}
		];
	});
}

/** Codex's rate limit snapshots, one per limit (the account's, a model's), as limits. */
export function codexLimits(snapshots: unknown): UsageLimit[] {
	if (!Array.isArray(snapshots)) return [];
	return snapshots.flatMap((value) => {
		const snapshot = record(value);
		if (!snapshot) return [];
		const limited = snapshot.rateLimitReachedType != null;
		// a limit of its own (a model's) is named; the account's is not
		const of = typeof snapshot.limitName === 'string' ? ` (${snapshot.limitName})` : '';
		return [snapshot.primary, snapshot.secondary].flatMap((value): UsageLimit[] => {
			const window = record(value);
			if (!window) return [];
			const percent = number(window.usedPercent);
			const resets = number(window.resetsAt);
			return [
				{
					name: windowName(number(window.windowDurationMins)) + of,
					...(percent !== undefined && { usedPercent: percent }),
					...(resets !== undefined && { resetsAt: resets * 1000 }),
					status: limited ? 'limited' : statusOf(percent, (percent ?? 0) >= WARNING_PERCENT)
				}
			];
		});
	});
}

/** The limits a `usage_update`'s `_meta` carries, if it carries any. */
export function limitsIn(meta: unknown): UsageLimit[] | undefined {
	const known = record(meta);
	if (!known) return undefined;
	const limits =
		'_claude/rateLimit' in known
			? claudeLimits(known['_claude/rateLimit'])
			: 'codex/rateLimits' in known
				? codexLimits(known['codex/rateLimits'])
				: [];
	return limits.length ? limits : undefined;
}
