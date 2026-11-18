import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SETTING, type Model } from '@geordi/protocol';
import type { AgentAdapter } from './adapter.ts';

/**
 * Reads the models Codex offers from the list it keeps for its own model picker. That file
 * is Codex's business, not an interface: if it is missing or looks different, there are
 * simply no models to choose from, and Codex runs with the one it is configured for.
 */
export function modelsIn(cache: string): Model[] {
	try {
		const { models } = JSON.parse(cache) as {
			models: {
				slug: string;
				display_name?: string;
				visibility?: string;
				supported_reasoning_levels?: { effort: string }[];
			}[];
		};
		return models
			.filter((model) => model.visibility === 'list' && SETTING.test(model.slug))
			.map((model) => ({
				id: model.slug,
				name: model.display_name ?? model.slug,
				efforts: (model.supported_reasoning_levels ?? [])
					.map((level) => level.effort)
					.filter((effort) => SETTING.test(effort))
			}));
	} catch {
		return [];
	}
}

export const codex: AgentAdapter = {
	offers() {
		let cache = '';
		try {
			const home = process.env.CODEX_HOME || join(homedir(), '.codex');
			cache = readFileSync(join(home, 'models_cache.json'), 'utf8');
		} catch {
			// no list: nothing to choose from
		}
		const models = modelsIn(cache);
		// without a model chosen, only what every model can do is safe to ask for
		const efforts = (models[0]?.efforts ?? []).filter((effort) =>
			models.every((model) => model.efforts.includes(effort))
		);
		return { models, efforts };
	}
};
