import type { CheckCounts, PullRequest } from '@geordi/protocol';

type Tone = 'danger' | 'ok' | 'neutral' | 'accent';
type Part = { size: number; tone: Tone };
type Summary = { text: string; parts: Part[] };

export function describeCounts({ failed, passed, skipped, pending }: CheckCounts): Summary {
	const parts: Part[] = [
		{ size: failed, tone: 'danger' },
		{ size: passed, tone: 'ok' },
		{ size: skipped, tone: 'neutral' },
		{ size: pending, tone: 'accent' }
	];
	const text = [
		failed && `${failed} failed`,
		pending && `${pending} running`,
		passed && `${passed} passed`,
		skipped && `${skipped} skipped`
	]
		.filter(Boolean)
		.join(', ');
	return { parts: parts.filter((part) => part.size > 0), text };
}

export function describeChecks({
	counts,
	state,
	total,
	failed
}: NonNullable<PullRequest['checks']>): Summary {
	if (counts) return describeCounts(counts);
	const whole = (tone: Tone, text: string) => ({ parts: [{ size: 1, tone }], text });
	switch (state) {
		case 'success':
			return whole('ok', total === null ? 'Passed' : `${total} passed`);
		case 'failure':
			return whole(
				'danger',
				failed === null || total === null ? 'Failed' : `${failed} of ${total} failed`
			);
		case 'pending':
			return whole('accent', total === null ? 'Running' : `${total} running`);
		default:
			return whole('neutral', 'Unknown');
	}
}
