<script lang="ts">
	import { untrack } from 'svelte';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import { submitOnEnter } from '#lib/keys.ts';
	import type { Session } from '#lib/server/workspaces.ts';
	import { toBlocks } from '#lib/transcript.ts';
	import { sendMessage, stopSession } from '../../../routes/workspaces.remote';

	let { session, cwd }: { session: Session; cwd?: string } = $props();

	const running = $derived(session.status === 'running');
	const blocks = $derived(toBlocks(session.transcript));
	// Several sessions are on screen at once; each needs its own instance of the form.
	const form = $derived(sendMessage.for(session.id));

	// Follow new output while the reader is at the bottom; leave them alone once they scroll up.
	let scroller: HTMLElement;
	let following = $state(true);
	const toLatest = () => {
		following = true;
		scroller.scrollTop = scroller.scrollHeight;
	};
	$effect(() => {
		void blocks;
		if (untrack(() => following)) toLatest();
	});
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#if running}
		<div class="visor absolute inset-x-0 top-0 z-10" role="status" aria-label="Working"></div>
	{/if}

	<div
		bind:this={scroller}
		onscroll={() =>
			(following = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80)}
		class="min-h-0 flex-1 overflow-y-auto"
	>
		<ol class="mx-auto w-full max-w-3xl space-y-8 px-5 py-6">
			{#each blocks as block, i (i)}
				<li>
					{#if block.kind === 'user'}
						<div
							class="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 whitespace-pre-wrap"
						>
							{block.text}
						</div>
					{:else}
						<div class="flex gap-3.5">
							<AgentAvatar agent={session.agent} />
							<div class="min-w-0 flex-1 space-y-3 pt-0.5">
								{#each block.parts as part, j (j)}
									{#if part.kind === 'text'}
										<Markdown text={part.text} />
									{:else if part.kind === 'tools'}
										<ToolGroup tools={part.tools} {cwd} />
									{:else}
										<div
											class="flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
										>
											<span class="mt-0.5 icon-[lucide--triangle-alert] size-4 shrink-0"></span>
											<p>{part.error}</p>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	</div>

	<div class="relative shrink-0">
		{#if !following}
			<button
				type="button"
				onclick={toLatest}
				class="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface py-1.5 pr-3.5 pl-3 text-sm font-medium shadow-float ring-1 ring-line/60 hover:text-accent-ink"
			>
				<span class="icon-[lucide--arrow-down] size-3.5"></span>
				Jump to latest
			</button>
		{/if}
		<form {...form} class="mx-auto max-w-3xl px-5 pb-4">
			<input {...form.fields.sessionId.as('hidden', session.id)} />
			<div
				class="rounded-2xl bg-surface shadow-float ring-1 ring-line/60 focus-within:ring-accent/60"
			>
				<textarea
					{...form.fields.text.as('text')}
					rows="2"
					aria-label="Reply to the agent"
					placeholder={running ? 'The agent is working…' : 'Reply to the agent'}
					disabled={running}
					onkeydown={submitOnEnter}
					class="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 placeholder:text-muted/60 focus-visible:outline-none disabled:cursor-not-allowed"
				></textarea>
				<div class="flex items-center gap-2 px-3 pb-3">
					{#each form.fields.text.issues() ?? [] as problem (problem.message)}
						<p class="text-sm text-danger">{problem.message}</p>
					{:else}
						<p class="hidden text-xs text-muted sm:block">
							Enter to send, Shift+Enter for a new line
						</p>
					{/each}
					{#if running}
						<button
							type="button"
							onclick={() => stopSession(session.id)}
							class="ml-auto flex items-center gap-2 rounded-full bg-sunken py-1.5 pr-3.5 pl-3 text-sm font-medium ring-1 ring-line hover:bg-line/50"
						>
							<span class="icon-[lucide--square] size-3.5"></span>
							Stop
						</button>
					{:else}
						<button
							class="ml-auto grid size-8 place-items-center rounded-full bg-accent text-on-accent shadow-soft hover:brightness-105"
							aria-label="Send"
						>
							<span class="icon-[lucide--arrow-up] size-4.5"></span>
						</button>
					{/if}
				</div>
			</div>
		</form>
	</div>
</div>
