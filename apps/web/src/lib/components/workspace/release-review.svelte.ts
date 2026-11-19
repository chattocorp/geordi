import type { ReleaseReview } from '@geordi/protocol';
import { SvelteSet } from 'svelte/reactivity';
import { mergePull, setAutoMerge } from '../../../routes/workspaces.remote';

type Choice = 'cancel' | 'retry' | 'confirm';
export type ReleaseQuestion = ReleaseReview & { auto: boolean; answer(choice: Choice): void };
const questions = $state<ReleaseQuestion[]>([]);
const busy = new SvelteSet<string>();
export const releaseReview = {
	get asking() {
		return questions[0] ?? null;
	}
};

async function run(workspaceId: string, pullNumber?: string) {
	if (busy.has(workspaceId)) return null;
	busy.add(workspaceId);
	try {
		let confirmation: string | undefined;
		for (;;) {
			const result = pullNumber
				? await setAutoMerge({ workspaceId, pullNumber, enabled: true, confirmation })
				: await mergePull({ workspaceId, confirmation });
			if (!result || typeof result === 'string') return result;
			const decision = Promise.withResolvers<Choice>();
			questions.push({ ...result, auto: !!pullNumber, answer: decision.resolve });
			const choice = await decision.promise;
			questions.shift();
			if (choice === 'cancel') return null;
			confirmation = choice === 'confirm' ? result.token : undefined;
		}
	} finally {
		busy.delete(workspaceId);
	}
}

export const mergeWithReview = (workspaceId: string) => run(workspaceId);
export const enableWithReview = (workspaceId: string, pullNumber: string) =>
	run(workspaceId, pullNumber);
