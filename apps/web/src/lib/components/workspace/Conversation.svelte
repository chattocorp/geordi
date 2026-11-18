<script lang="ts">
	import { resolve } from '$app/paths';
	import MessageView from './MessageView.svelte';
	import type { Workspace } from '#lib/server/workspaces.ts';
	import { draft } from '#lib/drafts.svelte.ts';
	import { modifierKey } from '#lib/keys.ts';
	import { toBlocks } from '#lib/transcript.ts';
	import Button from '#lib/ui/Button.svelte';
	import MessageComposer from '#lib/components/MessageComposer.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { Navigation, WorkspaceUpdate } from '#lib/server/views.ts';
	import {
		configureWorkspace,
		answerQuestion,
		removeQueued,
		sendMessage,
		stopAgent
	} from '../../../routes/workspaces.remote';
	import HarnessPicker, { resolveChoice, type HarnessChoice } from './HarnessPicker.svelte';
	import ContextMeter from './ContextMeter.svelte';

	/**
	 * A workspace's conversation with its agent, and the box to reply in. `senders` names
	 * the workspaces whose agents may have written here, by ID.
	 */
	let {
		workspace,
		senders,
		onopensubagent
	}: {
		workspace: Workspace & Pick<WorkspaceUpdate, 'background'>;
		onopensubagent: (id: string) => void;
		senders?: Record<string, string>;
	} = $props();

	const cwd = $derived(workspace.worktree?.path);

	const running = $derived(workspace.status === 'running');
	const blocks = $derived(toBlocks(workspace.transcript));
	// Each workspace needs its own instance of the form.
	const form = $derived(sendMessage.for(workspace.id));
	// What is written and not sent yet stays, when one goes elsewhere and comes back.
	const written = draft(
		() => `reply:${workspace.id}`,
		() => form.fields.text
	);

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
	const configure = (next: HarnessChoice) => {
		if (!harnesses?.length) return;
		const { model, permissionMode } = next.settings[workspace.agent] ?? {};
		const { effort } = resolveChoice(harnesses, next);
		return configureWorkspace({ workspaceId: workspace.id, model, effort, permissionMode });
	};

	let messages = $state<MessageView>();
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
	{#key workspace.id}
		<MessageView
			bind:this={messages}
			showJump
			{blocks}
			withComposer={!workspace.archivedAt}
			background={workspace.background?.filter((task) => !task.session)}
			agent={workspace.agent}
			{running}
			{cwd}
			pictures={resolve('/workspaces/[id]/picture', { id: workspace.id })}
			{senders}
			{onopensubagent}
			queue={workspace.queue}
			queueImages={workspace.attachments.queue}
			onremove={(index, text, images) =>
				removeQueued({ workspaceId: workspace.id, index, text, images })}
			onanswer={(question, answers) =>
				answerQuestion({ workspaceId: workspace.id, question, answers })}
		/>
	{/key}

	<div class="relative mx-auto w-full max-w-5xl shrink-0">
		{#if !workspace.archivedAt}
			<!-- Saying something brings the reader back down, to where it and the answer appear. -->
			<div class="px-5 pb-5" onsubmit={toLatest}>
				<MessageComposer
					bind:images={written.images}
					imageField={form.fields.images.as('hidden', '[]')}
					disabled={form.pending > 0}
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
					problems={[
						...(form.fields.text.issues() ?? []),
						...(form.fields.images.issues() ?? [])
					].map((problem) => problem.message)}
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
							<!-- how full the conversation is: nothing until the agent first says -->
							{#if workspace.usage}
								<ContextMeter usage={workspace.usage} />
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
								<!--
									Three things to do, each saying what it is: stop the agent, or say something
									to it, later or now. (That it works is said by the box's edge, and the ribbon.)
								-->
								<Button
									icon="icon-[lucide--square]"
									label="Stop the agent"
									onclick={() => stopAgent(workspace.id)}
								/>
								<Button
									{...form.fields.mode.as('submit', 'queue')}
									icon="icon-[lucide--list-plus]"
									label="Queue: send this when the agent is done"
								>
									Queue
								</Button>
								<Button
									{...form.fields.mode.as('submit', 'steer')}
									variant="primary"
									icon="icon-[lucide--corner-down-right]"
									label="Steer: send to the working agent"
								>
									Steer
								</Button>
							{:else}
								<Button
									{...form.fields.mode.as('submit', 'steer')}
									variant="primary"
									icon="icon-[lucide--arrow-up]"
									label="Send"
								/>
							{/if}
						</div>
					{/snippet}
				</MessageComposer>
			</div>
		{/if}
	</div>
</div>
