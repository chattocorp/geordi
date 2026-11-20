import { expect, it } from 'vitest';
import { modelsIn } from './opencode-models.ts';

it('lists unique provider-qualified model IDs and ignores CLI diagnostics', () => {
	const list = modelsIn(
		'a/model\r\nb/model\na/model\nrouter/org/model\nwarning: cache unavailable\n/no-provider\n'
	);
	expect(list.map((model) => model.id)).toEqual(['a/model', 'b/model', 'router/org/model']);
	expect(modelsIn('')).toEqual([]);
});
