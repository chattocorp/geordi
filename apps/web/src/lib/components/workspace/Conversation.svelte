<script lang="ts">
	import MessageView from './MessageView.svelte';
	import type { Workspace } from '#lib/server/workspaces.ts';
	import { modifierKey } from '#lib/keys.ts';
	import { toBlocks } from '#lib/transcript.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
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

	let messages = $state<MessageView>();
	let following = $state(true);
	const toLatest = () => messages?.toLatest();
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
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#if running}
		<!-- on the line under the tabs, not below it -->
		<div class="visor absolute inset-x-0 -top-px z-10" role="status" aria-label="Working"></div>
	{/if}

	{#key workspace.id}
		<MessageView
			bind:this={messages}
			bind:following
			{blocks}
			agent={workspace.agent}
			{running}
			{cwd}
			{senders}
			queue={workspace.queue}
			onremove={(index, text) => removeQueued({ workspaceId: workspace.id, index, text })}
		/>
	{/key}

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
						<!-- (Not while the agent works in a box too narrow for them and the buttons
						     both: then it is the buttons that are needed, on one line.) -->
						<div
							class={['min-w-0 flex-wrap items-center gap-1', running ? 'hidden @lg:flex' : 'flex']}
						>
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
