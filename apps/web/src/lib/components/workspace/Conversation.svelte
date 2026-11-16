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
	import Spinner from '#lib/ui/Spinner.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import {
		configureWorkspace,
		removeQueued,
		sendMessage,
		stopAgent
	} from '../../../routes/workspaces.remote';
	import HarnessPicker, { type HarnessChoice } from './HarnessPicker.svelte';

	/**
	 * A workspace's conversation with its agent, and the box to reply in. `senders` names
	 * the workspaces whose agents may have written here, by ID.
	 */
	let { workspace, senders }: { workspace: Workspace; senders?: Record<string, string> } = $props();

	const cwd = $derived(workspace.worktree?.path);

	const running = $derived(workspace.status === 'running');
	const blocks = $derived(toBlocks(workspace.transcript));
	// Each workspace needs its own instance of the form.
	const form = $derived(sendMessage.for(workspace.id));

	// The agent of a conversation is who it is; which of its models answers next, and how hard
	// it thinks, can be chosen with every message (FDR-004). Only this agent's are on offer.
	const offered = follow<Navigation>('navigation');
	const harnesses = $derived(
		offered.current?.harnesses?.filter((harness) => harness.agent === workspace.agent)
	);
	const choice = $derived.by((): HarnessChoice => {
		const { model } = workspace.settings;
		const listed = harnesses?.[0]?.models.some((known) => known.id === model);
		return {
			agent: workspace.agent,
			settings: { [workspace.agent]: { ...workspace.settings, named: !!model && !listed } }
		};
	});
	const configure = ({ settings }: HarnessChoice) => {
		const { model, effort } = settings[workspace.agent] ?? {};
		return configureWorkspace({ workspaceId: workspace.id, model, effort });
	};

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
		// what is said, and what waits to be said, both make the conversation longer
		void [blocks, workspace.queue.length, workspace.steering.length];
		if (untrack(() => following)) toLatest();
	});
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#if running}
		<!-- on the line under the tabs, not below it -->
		<div class="visor absolute inset-x-0 -top-px z-10" role="status" aria-label="Working"></div>
	{/if}

	<div bind:this={scroller} onscroll={atBottom} class="scroller">
		<!--
			No wider than reads well, in the middle of whatever room there is. Inset on the right
			by as much as the avatar insets the agent's text on the left.
		-->
		<ol class="mx-auto w-full max-w-5xl space-y-8 py-6 pr-16.5 pl-5">
			{#each blocks as block, i (i)}
				<li>
					{#if block.kind === 'user'}
						{#if block.from}
							<!-- not the person's words: another agent's, and whose -->
							<p class="flex items-center justify-end gap-1.5 pb-1 text-xs text-muted">
								<span class="icon-[lucide--bot] size-3.5"></span>
								{senders?.[block.from]
									? `From the agent in “${senders[block.from]}”`
									: 'From another agent'}
							</p>
						{/if}
						<div class="ml-auto message bg-bubble whitespace-pre-wrap">
							{block.text}
						</div>
					{:else if block.kind === 'note'}
						<!-- something that happened to the workspace: said in passing, between the two -->
						<p class="flex items-center gap-3 text-xs text-muted">
							<span class="h-px flex-1 bg-line"></span>
							{block.text}
							<span class="h-px flex-1 bg-line"></span>
						</p>
					{:else}
						<div class="flex gap-3.5">
							<AgentAvatar agent={workspace.agent} />
							<div class="min-w-0 flex-1 space-y-3 pt-0.5">
								{#each block.parts as part, j (j)}
									{#if part.kind === 'text'}
										<Markdown text={part.text} />
									{:else if part.kind === 'tools'}
										<!-- live: the agent is at work, and this is the last thing it did -->
										<ToolGroup
											tools={part.tools}
											{cwd}
											live={running && i === blocks.length - 1 && j === block.parts.length - 1}
										/>
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
			<!-- Saying something brings the reader back down, to where it and the answer appear. -->
			<div class="mx-auto max-w-5xl px-5 pb-4" onsubmit={toLatest}>
				<Composer
					{form}
					live={running}
					rows={2}
					placeholder={running
						? 'Steer the agent, or queue a message'
						: workspace.transcript.length === 0
							? 'What should the agent do?'
							: 'Reply to the agent'}
					onkeydown={keys}
					field={form.fields.text.as('text')}
					problems={form.fields.text.issues()?.map((problem) => problem.message)}
				>
					{#snippet header()}
						<input {...form.fields.workspaceId.as('hidden', workspace.id)} />
					{/snippet}
					{#snippet footer()}
						<!-- who answers next, and how hard it thinks: as where the workspace was started -->
						<div class="flex min-w-0 flex-wrap items-center gap-1">
							{#if harnesses?.length}
								<HarnessPicker {harnesses} {choice} onchange={configure} />
							{/if}
						</div>
						<!-- At the far end, together, however narrow the box: what does not fit there goes
						     below as one, and stays on that side. -->
						<div class="ml-auto flex h-9 items-center gap-2">
							<!-- how to send: said while writing, and where there is room for it -->
							<p
								class="invisible hidden pr-1 text-xs whitespace-nowrap text-muted group-focus-within/composer:visible @4xl:block"
							>
								{running
									? `Enter to steer, ${modifier}Enter to queue`
									: 'Enter to send, Shift+Enter for a new line'}
							</p>
							{#if running}
								<!-- at work, which it shows; pointed at, it is the way to stop that -->
								<button
									type="button"
									onclick={() => stopAgent(workspace.id)}
									title="Stop the agent"
									aria-label="Stop the agent"
									class="group/stop grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-sm ring-1 ring-line hover:bg-line/50"
								>
									<span
										class="grid place-items-center group-hover/stop:hidden group-focus-visible/stop:hidden"
									>
										<Spinner label="Working" />
									</span>
									<span
										class="icon-[lucide--square] hidden size-3.5 group-hover/stop:block group-focus-visible/stop:block"
									></span>
								</button>
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
