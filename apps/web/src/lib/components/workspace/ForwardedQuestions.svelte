<script lang="ts">
	import type { WorkspaceUpdate } from '#lib/server/views.ts';
	import QuestionCard from '#lib/components/QuestionCard.svelte';
	import Disclosure from '@geordi/ui/Disclosure.svelte';

	let {
		requests,
		onanswer
	}: {
		requests: WorkspaceUpdate['forwardedQuestions'];
		onanswer: (workspace: string, question: string, answers: string[]) => unknown;
	} = $props();
</script>

<nav
	aria-label="Questions from child workspaces"
	class="mx-auto max-h-1/2 w-full max-w-5xl space-y-1 overflow-y-auto px-5 pb-2"
>
	{#each requests as request (JSON.stringify([request.workspaceId, request.id]))}
		<Disclosure class="group mx-1 rounded-card bg-sidebar px-3 py-1" summaryClass="min-h-9 text-sm">
			{#snippet heading()}
				<span
					aria-hidden="true"
					class="icon-[lucide--message-circle-question-mark] size-4 shrink-0 text-accent"
				></span>
				<span class="min-w-0 truncate">
					<strong>{request.title}</strong><span class="group-open:hidden">
						· {request.questions[0]?.question}
					</span>
				</span>
			{/snippet}
			<QuestionCard
				questions={request.questions}
				open
				answers={null}
				onanswer={(answers) => onanswer(request.workspaceId, request.id, answers)}
			/>
		</Disclosure>
	{/each}
</nav>
