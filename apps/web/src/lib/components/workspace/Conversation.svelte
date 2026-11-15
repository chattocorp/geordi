<script lang="ts">
	import { untrack } from 'svelte';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import type { Workspace } from '#lib/server/workspaces.ts';
	import { modifierKey } from '#lib/keys.ts';
	import { toBlocks } from '#lib/transcript.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { removeQueued, sendMessage, stopAgent } from '../../../routes/workspaces.remote';

	/** A workspace's conversation with its agent, and the box to reply in. */
	let { workspace }: { workspace: Workspace } = $props();

	const cwd = $derived(workspace.worktree?.path);

	const running = $derived(workspace.status === 'running');
	const blocks = $derived(toBlocks(workspace.transcript));
	// Each workspace needs its own instance of the form.
	const form = $derived(sendMessage.for(workspace.id));

	// Follow new output while the reader is at the bottom; leave them alone once they scroll up.
	let scroller: HTMLElement | undefined;
	let following = $state(true);
	const toLatest = () => {
		following = true;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	};
	const modifier = modifierKey();

	/**
	 * Enter says it now (steering the agent if it is working); with Cmd or Ctrl it waits for
	 * the agent to finish. Each is one of the form's submit buttons, pressed for the user.
	 */
	function keys(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		const { form } = event.currentTarget;
		const mode = running && (event.metaKey || event.ctrlKey) ? 'queue' : 'steer';
		form?.requestSubmit(form.querySelector<HTMLButtonElement>(`button[value=${mode}]`));
	}

	/** Scroll events can still arrive while the view is being taken down. */
	const atBottom = () => {
		if (scroller)
			following = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
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

	<div bind:this={scroller} onscroll={atBottom} class="scroller">
		<!-- Inset on the right by as much as the avatar insets the agent's text on the left. -->
		<ol class="w-full space-y-8 py-6 pr-16.5 pl-5">
			{#each blocks as block, i (i)}
				<li>
					{#if block.kind === 'user'}
						<div class="ml-auto message bg-bubble whitespace-pre-wrap">
							{block.text}
						</div>
					{:else}
						<div class="flex gap-3.5">
							<AgentAvatar agent={workspace.agent} />
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
			{#each workspace.queue as text, index (index)}
				<li class="flex items-start justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						icon="icon-[lucide--x]"
						label="Don't send this"
						onclick={() => removeQueued({ workspaceId: workspace.id, index, text })}
						class="mt-1.5"
					/>
					<div class="message ring-1 ring-line">
						<p class="label">Queued</p>
						<p class="whitespace-pre-wrap text-muted">{text}</p>
					</div>
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
		{#if !workspace.archivedAt}
			<div class="px-5 pb-4">
				<Composer
					{form}
					rows={2}
					placeholder={running ? 'Steer the agent, or queue a message' : 'Reply to the agent'}
					onkeydown={keys}
					field={form.fields.text.as('text')}
					problems={form.fields.text.issues()?.map((problem) => problem.message)}
				>
					{#snippet header()}
						<input {...form.fields.workspaceId.as('hidden', workspace.id)} />
					{/snippet}
					{#snippet footer()}
						<p class="hidden pl-1 text-xs text-muted sm:block">
							{running
								? `Enter to steer, ${modifier}Enter to queue`
								: 'Enter to send, Shift+Enter for a new line'}
						</p>
						<div class="ml-auto flex items-center gap-2">
							{#if running}
								<Button icon="icon-[lucide--square]" onclick={() => stopAgent(workspace.id)}>
									Stop
								</Button>
								<Button {...form.fields.mode.as('submit', 'queue')} icon="icon-[lucide--list-plus]">
									Queue
								</Button>
							{/if}
							<Button
								{...form.fields.mode.as('submit', 'steer')}
								variant="primary"
								icon={running ? 'icon-[lucide--corner-down-right]' : 'icon-[lucide--arrow-up]'}
								label={running ? 'Steer: interrupt the agent with this' : 'Send'}
							/>
						</div>
					{/snippet}
				</Composer>
			</div>
		{/if}
	</div>
</div>
