<script lang="ts">
	import type { Question } from '@geordi/protocol';
	import Button from '#lib/ui/Button.svelte';

	/**
	 * Something the agent asks the person: each question with the
	 * answers it offers, any of which can be given, or one in the person's own words. Once
	 * it is answered (or the agent has gone on without), it only says what was said.
	 */
	let {
		questions,
		answers,
		open,
		delivery,
		blocking = true,
		onanswer
	}: {
		questions: Question[];
		/** What was answered, one per question; `null` if nothing was. */
		answers: string[] | null;
		/** Whether the person can still submit an answer. */
		open: boolean;
		blocking?: boolean;
		delivery?: 'pending' | 'unconfirmed';
		onanswer: (answers: string[]) => unknown;
	} = $props();

	/** Which of each question's options are chosen, and what is said instead of them. */
	let chosen = $state<string[][]>([]);
	let own = $state<string[]>([]);
	let sending = $state(false);

	const given = $derived(questions.map((_, i) => own[i]?.trim() || (chosen[i] ?? []).join('\n')));

	function choose(i: number, label: string, several: boolean) {
		const now = chosen[i] ?? [];
		own[i] = '';
		chosen[i] = !several
			? [label]
			: now.includes(label)
				? now.filter((other) => other !== label)
				: [...now, label];
	}

	async function answer(event: SubmitEvent) {
		event.preventDefault();
		sending = true;
		try {
			await onanswer(given);
		} finally {
			sending = false;
		}
	}
</script>

<form class="space-y-5 card p-4" onsubmit={answer}>
	{#each questions as question, i (i)}
		<fieldset class="space-y-2">
			<legend class="pb-1">
				{#if question.header}<span class="block label">{question.header}</span>{/if}
				<span class="font-medium">{question.question}</span>
			</legend>
			{#if open}
				{#each question.options as option (option.label)}
					{@const picked = (chosen[i] ?? []).includes(option.label)}
					<button
						type="button"
						class={['item w-full px-3 py-2 text-left', picked && 'item-active']}
						aria-pressed={picked}
						onclick={() => choose(i, option.label, question.multiSelect)}
					>
						<span
							class={[
								'size-4 shrink-0',
								picked ? 'icon-[lucide--circle-check] text-accent' : 'icon-[lucide--circle]'
							]}
						></span>
						<span class="min-w-0">
							<span class="block text-ink">{option.label}</span>
							{#if option.description && option.description !== option.label}
								<span class="block text-xs text-muted">{option.description}</span>
							{/if}
						</span>
					</button>
				{/each}
				<input
					class="w-full input text-sm"
					placeholder="Or say it in your own words"
					aria-label="Your own answer to: {question.question}"
					bind:value={own[i]}
					oninput={() => (chosen[i] = [])}
				/>
			{:else}
				<p class="text-sm text-muted">{answers?.[i] || 'Not answered'}</p>
			{/if}
		</fieldset>
	{/each}
	{#if delivery}
		<p role="status" class="text-xs text-muted">
			{delivery === 'pending'
				? 'Waiting for the agent to receive your answer.'
				: 'The question closed before delivery was confirmed.'}
		</p>
	{/if}
	{#if open}
		<div class="flex justify-end">
			<Button
				type="submit"
				variant="primary"
				disabled={!questions.every((q, i) => q.optional || given[i]) ||
					(!blocking && !given.some(Boolean))}
				busy={sending}
			>
				Answer
			</Button>
		</div>
	{/if}
</form>
