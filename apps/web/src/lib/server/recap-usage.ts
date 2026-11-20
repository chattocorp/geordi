import type { Agent, DaemonMessage } from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';

type Measurement = Extract<DaemonMessage, { type: 'recap.measured' }>;
export type RecapUsageEvent = {
	type: 'recap.measured';
	stream: `recap:${string}`;
	data: Omit<Measurement, 'type'>;
};
export type RecapTotals = Record<Agent, number>;

export function createRecapUsage(store: EventStore<GeordiEvent>) {
	const totals = store.project(
		'recap-usage',
		(): RecapTotals => ({ claude: 0, codex: 0 }),
		(state, event) => {
			if (event.type === 'recap.measured') state[event.data.agent] += event.data.usage.totalTokens;
			return state;
		},
		['recap']
	);
	return {
		totals: totals.get,
		record({ type, ...data }: Measurement) {
			const stream = `recap:${data.id}` as const;
			if (!store.readStream(stream).length)
				store.append({ type, stream, data }, { actor: data.workspaceId });
		}
	};
}
