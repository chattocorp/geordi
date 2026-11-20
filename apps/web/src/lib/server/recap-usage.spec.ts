import { expect, it } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRecapUsage } from './recap-usage.ts';

it('keeps provider-reported counts across replay and counts each fork once', () => {
	const store = new EventStore<GeordiEvent>(':memory:');
	const meter = createRecapUsage(store);
	const claude = {
		type: 'recap.measured' as const,
		id: 'fork-one',
		workspaceId: 'w',
		agent: 'claude' as const,
		usage: { inputTokens: 5, outputTokens: 10, cachedReadTokens: 12, totalTokens: 27 }
	};
	meter.record(claude);
	meter.record(claude);
	meter.record({
		...claude,
		agent: 'codex',
		id: 'fork-two',
		usage: { inputTokens: 6, outputTokens: 3, totalTokens: 9 }
	});
	expect(createRecapUsage(store).totals()).toEqual({ claude: 27, codex: 9 });
	expect(store.readStream('recap:fork-one')).toHaveLength(1);
	expect(store.readStream('recap:fork-one')[0].data).toMatchObject({ usage: claude.usage });
});
