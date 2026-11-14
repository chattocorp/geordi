<script lang="ts">
	import { untrack } from 'svelte';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import type { Session } from '#lib/server/workspaces.ts';
	import { toBlocks } from '#lib/transcript.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import Notice from '#lib/ui/Notice.svelte';
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
							class="ml-auto w-fit max-w-[85%] rounded-card rounded-br-control bg-bubble px-4 py-2.5 whitespace-pre-wrap"
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
										<Notice>{part.error}</Notice>
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
			<Button
				icon="icon-[lucide--arrow-down]"
				onclick={toLatest}
				class="absolute -top-12 left-1/2 -translate-x-1/2 bg-surface shadow-float"
			>
				Jump to latest
			</Button>
		{/if}
		<div class="mx-auto max-w-3xl px-5 pb-4">
			<Composer
				{form}
				rows={2}
				placeholder={running ? 'The agent is working…' : 'Reply to the agent'}
				field={form.fields.text.as('text')}
				disabled={running}
				problems={form.fields.text.issues()?.map((problem) => problem.message)}
			>
				{#snippet header()}<input {...form.fields.sessionId.as('hidden', session.id)} />{/snippet}
				{#snippet footer()}
					<p class="hidden pl-1 text-xs text-muted sm:block">
						Enter to send, Shift+Enter for a new line
					</p>
					{#if running}
						<Button
							icon="icon-[lucide--square]"
							class="ml-auto"
							onclick={() => stopSession(session.id)}
						>
							Stop
						</Button>
					{:else}
						<Button
							type="submit"
							variant="primary"
							icon="icon-[lucide--arrow-up]"
							label="Send"
							class="ml-auto"
						/>
					{/if}
				{/snippet}
			</Composer>
		</div>
	</div>
</div>
