import { expect, it } from 'vitest';
import { modelsIn } from './codex.ts';

it('reads the models Codex offers from its own list, and survives not finding it', () => {
	const cache = JSON.stringify({
		models: [
			{
				slug: 'gpt-x',
				display_name: 'GPT-X',
				visibility: 'list',
				supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }]
			},
			{ slug: 'internal', visibility: 'hide' },
			{ slug: '--evil', visibility: 'list' }
		]
	});
	expect(modelsIn(cache)).toEqual([{ id: 'gpt-x', name: 'GPT-X', efforts: ['low', 'high'] }]);
	expect(modelsIn('')).toEqual([]);
	expect(modelsIn('{"something":"else"}')).toEqual([]);
});
