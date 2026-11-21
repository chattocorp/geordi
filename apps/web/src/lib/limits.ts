import type { UsageLimit } from '@geordi/protocol';

/** How something that runs out stands: fine, getting low, or (nearly) gone. */
export type Tone = 'normal' | 'warning' | 'danger';

const TONES: Tone[] = ['normal', 'warning', 'danger'];

/**
 * How something stands with `left` of it (0 to 1) left, and what its provider says of it:
 * low from 30% left, nearly gone from 10%, in the whole percent that people are shown.
 */
export function toneOf(left: number | undefined, status: UsageLimit['status'] = 'ok'): Tone {
	const percent = left === undefined ? undefined : Math.round(left * 100);
	if (status === 'limited' || (percent !== undefined && percent <= 10)) return 'danger';
	if (status === 'warning' || (percent !== undefined && percent <= 30)) return 'warning';
	return 'normal';
}

/**
 * What is left of a limit, 0 to 1: where its provider says how much is used, or nothing
 * once it says the limit is reached.
 */
export const leftOf = ({ usedPercent, status }: UsageLimit) =>
	usedPercent !== undefined
		? Math.min(1, Math.max(0, 1 - usedPercent / 100))
		: status === 'limited'
			? 0
			: undefined;

/** How a limit stands. */
export const limitTone = (limit: UsageLimit) => toneOf(leftOf(limit), limit.status);

/**
 * Whether a limit holds for a model: the account's limits hold for every model, a model's
 * own (`Week (Opus)`) only where the model's name says it is that one.
 */
export function holdsFor({ name }: UsageLimit, model: string | undefined): boolean {
	const of = /\((.+)\)$/.exec(name)?.[1];
	return !of || (!!model && model.toLowerCase().includes(of.toLowerCase()));
}

/**
 * What is left of an agent's usage with a model, 0 to 1, and how that stands: the least of
 * what its limits leave, or `undefined` where none of them says how much is used.
 */
export function charge(
	limits: UsageLimit[],
	model: string | undefined
): { left: number; tone: Tone } | undefined {
	const holding = limits.filter((limit) => holdsFor(limit, model));
	const left = holding.map(leftOf).filter((left) => left !== undefined);
	if (!left.length) return undefined;
	const tone = TONES[Math.max(...holding.map((limit) => TONES.indexOf(limitTone(limit))))];
	return { left: Math.min(...left), tone };
}
