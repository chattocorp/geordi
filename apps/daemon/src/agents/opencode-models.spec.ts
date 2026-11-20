import { expect, it } from 'vitest';
import { modelsIn } from './opencode-models.ts';

it('lists unique provider-qualified model IDs and ignores CLI diagnostics', () => {
	const list = modelsIn(
		'a/model\r\nb/model\na/model\nrouter/org/model\nwarning: cache unavailable\n/no-provider\n'
	);
	expect(list.map((model) => model.id)).toEqual(['a/model', 'b/model', 'router/org/model']);
	expect(modelsIn('')).toEqual([]);
});

it('keeps each model’s enabled variants in CLI order and tolerates missing metadata', () => {
	const list = modelsIn(
		[
			'p/one',
			JSON.stringify(
				{ variants: { low: {}, custom: {}, off: { disabled: true }, 'bad key': {}, default: {} } },
				null,
				2
			),
			'p/two',
			'{"variants":{"high":{}}}',
			'p/three',
			'{"variants":{}}',
			'p/four',
			'{broken}'
		].join('\r\n')
	);
	expect(list.map(({ efforts }) => efforts)).toEqual([['low', 'custom'], ['high'], [], []]);
});
