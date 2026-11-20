<script lang="ts">
	import type { Question } from '@geordi/protocol';
	import Badge from '@geordi/ui/Badge.svelte';
	import Button from '@geordi/ui/Button.svelte';

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
		onreveal,
		onanswer
	}: {
		questions: Question[];
		/** What was answered, one per question; `null` if nothing was. */
		answers: string[] | null;
		/** Whether the person can still submit an answer. */
		open: boolean;
		blocking?: boolean;
		delivery?: 'pending' | 'unconfirmed';
		onreveal?: () => void;
		onanswer: (answers: string[]) => unknown;
	} = $props();

	/** Which of each question's options are chosen, and what is said instead of them. */
	let chosen = $state<string[][]>([]);
	let own = $state<string[]>([]);
	let sending = $state(false);

	/** Agents mark the option they would take by saying so in its label. */
	const RECOMMENDED = /\s*\(recommended\)\s*$/i;

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

<form
	class="space-y-6 card p-4"
	onsubmit={answer}
	{@attach (form) => {
		if (!onreveal) return;
		const done = onreveal;
		const frame = requestAnimationFrame(() => {
			form.querySelector<HTMLElement>('button, input, textarea')?.focus({ preventScroll: true });
			form.scrollIntoView({ block: 'start' });
			done();
		});
		return () => cancelAnimationFrame(frame);
	}}
>
	{#each questions as question, i (i)}
		<!-- Once closed, an optional question nobody answered (a note, say) has nothing to show. -->
		{#if open || answers?.[i] || !question.optional}
			<fieldset class="space-y-3">
				<legend class="space-y-0.5">
					{#if question.header}<span class="block label">{question.header}</span>{/if}
					<span class="block font-medium text-ink">{question.question}</span>
				</legend>
				{#if open}
					{#if question.options.length}
						<div class="-mx-2 space-y-0.5">
							{#each question.options as option (option.label)}
								{@const picked = (chosen[i] ?? []).includes(option.label)}
								{@const label = option.label.replace(RECOMMENDED, '')}
								<button
									type="button"
									class={[
										'item w-full items-start gap-3 px-2 py-1.5 text-left',
										picked && 'bg-sunken text-ink hover:bg-sunken'
									]}
									aria-pressed={picked}
									onclick={() => choose(i, option.label, question.multiSelect)}
								>
									<span
										class={[
											'mt-1 size-4 shrink-0',
											question.multiSelect
												? picked
													? 'icon-[lucide--square-check] text-accent'
													: 'icon-[lucide--square]'
												: picked
													? 'icon-[lucide--circle-check] text-accent'
													: 'icon-[lucide--circle]'
										]}
									></span>
									<span class="min-w-0 flex-1">
										<span class="flex flex-wrap items-center gap-2 text-ink">
											{label}
											{#if label !== option.label}<Badge>Recommended</Badge>{/if}
										</span>
										{#if option.description && option.description !== option.label}
											<span class="block text-xs text-muted">{option.description}</span>
										{/if}
									</span>
								</button>
							{/each}
						</div>
					{/if}
					<input
						class="w-full input text-sm"
						placeholder={question.options.length ? 'Or say it in your own words' : 'Your answer'}
						aria-label="Your own answer to: {question.question}"
						bind:value={own[i]}
						oninput={() => (chosen[i] = [])}
					/>
				{:else}
					<p class="flex items-start gap-2 text-sm text-muted">
						{#if answers?.[i]}
							<span class="mt-1 icon-[lucide--corner-down-right] size-4 shrink-0"></span>
							<span class="whitespace-pre-line text-ink">{answers[i]}</span>
						{:else}
							Not answered
						{/if}
					</p>
				{/if}
			</fieldset>
		{/if}
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
