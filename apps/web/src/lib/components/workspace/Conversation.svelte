<script lang="ts">
	import { resolve } from '$app/paths';
	import MessageView from './MessageView.svelte';
	import type { Workspace } from '#lib/server/workspaces.ts';
	import { draft } from '#lib/drafts.svelte.ts';
	import ReplyComposer from '@geordi/ui/ReplyComposer.svelte';
	import { toBlocks, type TurnChanges } from '#lib/transcript.ts';
	import WithMessageImages from '#lib/components/WithMessageImages.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { AgentCommand } from '@geordi/protocol';
	import type { Limits } from '#lib/server/limits.ts';
	import type { Navigation, WorkspaceUpdate } from '#lib/server/views.ts';
	import {
		findFiles,
		configureWorkspace,
		answerQuestion,
		removeQueued,
		sendMessage,
		stopTask,
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
		waiting = false,
		questionTarget,
		senders,
		autofocus = false,
		onautofocus,
		onopenturn,
		onopensubagent
	}: {
		workspace: Workspace & Pick<WorkspaceUpdate, 'background' | 'suggestion' | 'sessionModel'>;
		questionTarget?: { id: string; done(): void };
		waiting?: boolean;
		onopenturn?: (changes: TurnChanges) => void;
		onopensubagent: (id: string) => void;
		senders?: Record<string, string>;
		/** Put the cursor in the reply box now (it may be in a tab that was in the background). */
		autofocus?: boolean;
		onautofocus?: () => void;
	} = $props();

	let reply = $state<HTMLElement>();
	$effect(() => {
		if (!autofocus || !reply) return;
		reply.querySelector('textarea')?.focus();
		onautofocus?.();
	});

	const searchFiles = $derived.by(() => {
		const workspaceId = workspace.id;
		return (query: string) => findFiles({ workspaceId, query });
	});
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
		const { effort } = resolveChoice(harnesses, next, workspace.sessionModel);
		return configureWorkspace({ workspaceId: workspace.id, model, effort, permissionMode });
	};

	// The agent's own commands and skills, offered as one types `/`: once it has said which.
	const commands = follow<AgentCommand[] | null>('commands', () => workspace.id);
	// how much of the subscription's usage limits is used: told on hovering the context meter
	const limits = follow<Limits>('limits');
	const completions = $derived(
		(commands.current ?? []).map(({ name, description, hint }) => ({
			text: '/' + name,
			description,
			hint
		}))
	);

	let messages = $state<MessageView>();
	const toLatest = () => messages?.toLatest();
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#key workspace.id}
		<MessageView
			bind:this={messages}
			{questionTarget}
			showJump
			{blocks}
			withComposer={!workspace.archivedAt}
			onstoptask={(stopId) => stopTask({ workspaceId: workspace.id, stopId })}
			background={workspace.background?.filter((task) => !task.session)}
			agent={workspace.agent}
			{running}
			{cwd}
			pictures={resolve('/workspaces/[id]/picture', { id: workspace.id })}
			{senders}
			{onopensubagent}
			{onopenturn}
			queue={workspace.queue}
			queueImages={workspace.attachments.queue}
			onremove={(index, text, images) =>
				removeQueued({ workspaceId: workspace.id, index, text, images })}
			onanswer={(question, answers) =>
				answerQuestion({ workspaceId: workspace.id, question, answers })}
		/>
	{/key}

	<div class="relative mx-auto flex max-h-full min-h-0 w-full max-w-5xl flex-col">
		{#if !workspace.archivedAt}
			<!-- Saying something brings the reader back down, to where it and the answer appear. -->
			<div class="flex min-h-0 flex-col px-5 pb-5" onsubmit={toLatest} bind:this={reply}>
				<WithMessageImages
					{form}
					bind:images={written.images}
					imageField={form.fields.images.as('hidden', '[]')}
					disabled={form.pending > 0}
				>
					{#snippet children(imageProps, hasImages)}
						<ReplyComposer
							canSteer={workspace.agent !== 'opencode'}
							files={searchFiles}
							{...imageProps}
							focused
							disabled={form.pending > 0}
							{running}
							{waiting}
							empty={workspace.transcript.length === 0}
							sendButton={form.fields.mode.as('submit', 'steer')}
							queueButton={form.fields.mode.as('submit', 'queue')}
							onstop={() => stopAgent(workspace.id)}
							{completions}
							completionsLabel="Commands"
							suggestion={!hasImages && workspace.status === 'idle' ? workspace.suggestion : null}
							field={form.fields.text.as('text')}
							problems={[
								...(form.fields.text.issues() ?? []),
								...(form.fields.images.issues() ?? [])
							].map((problem) => problem.message)}
						>
							{#snippet header()}
								<input {...form.fields.workspaceId.as('hidden', workspace.id)} />
							{/snippet}
							{#snippet options()}
								{#if harnesses?.length}<HarnessPicker
										{harnesses}
										{choice}
										sessionModel={workspace.sessionModel}
										onchange={configure}
									/>{/if}
							{/snippet}
							{#snippet meter()}{#if workspace.usage}<ContextMeter
										usage={workspace.usage}
										agent={workspace.agent}
										limits={limits.current?.[workspace.agent]}
									/>{/if}{/snippet}
						</ReplyComposer>
					{/snippet}
				</WithMessageImages>
			</div>
		{/if}
	</div>
</div>
