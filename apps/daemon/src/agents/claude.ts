import type { AgentAdapter } from './adapter.ts';

/** `--effort` levels, the least first. */
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** The CLI's aliases, each for the latest model of its kind. */
const MODELS = ['Fable', 'Opus', 'Sonnet', 'Haiku'];

export const claude: AgentAdapter = {
	offers: () => ({
		models: MODELS.map((name) => ({ id: name.toLowerCase(), name, efforts: EFFORTS })),
		efforts: EFFORTS
	})
};
