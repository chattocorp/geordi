<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import BackgroundTasks from './BackgroundTasks.svelte';
	import { toolSummary } from '@geordi/ui/tools';
	import type { Agent, BackgroundTask, TurnUsage } from '@geordi/protocol';
	import { tokenBreakdown, tokenSummary } from '#lib/tokens.ts';
	import { duration } from '#lib/format.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Block, Part, TurnChanges } from '#lib/transcript.ts';
	import AgentText from '@geordi/ui/AgentText.svelte';
	import AgentMessage from '@geordi/ui/AgentMessage.svelte';
	import UserMessage from '@geordi/ui/UserMessage.svelte';
	import TurnActivity from '@geordi/ui/TurnActivity.svelte';
	import DiffStat from '@geordi/ui/DiffStat.svelte';
	import PatchView from '../PatchView.svelte';
	import { changedFiles } from '#lib/changedFiles.ts';
	import MessageImages from '#lib/components/MessageImages.svelte';
	import MessageCopy from '@geordi/ui/MessageCopy.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import PlanCard from '#lib/components/PlanCard.svelte';
	import QuestionCard from '#lib/components/QuestionCard.svelte';
	import SubagentRow from '#lib/components/SubagentRow.svelte';
	import ToolGroup from '@geordi/ui/ToolGroup.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Tooltip from '#lib/ui/Tooltip.svelte';

	let {
		blocks,
		background = [],
		onstoptask,
		withComposer = false,
		showJump = false,
		agent,
		running = false,
		cwd,
		pictures,
		senders,
		parentAgent,
		queue = [],
		queueImages = [],
		onopenturn,
		onopensubagent,
		onremove,
		questionTarget,
		onanswer,
		following = $bindable(true)
	}: {
		blocks: Block[];
		onstoptask?: (stopId: string) => Promise<void>;
		background?: BackgroundTask[];
		withComposer?: boolean;
		showJump?: boolean;
		agent: Agent;
		running?: boolean;
		cwd?: string;
		/** Where the pictures the agent refers to are served. */
		pictures?: string;
		senders?: Record<string, string>;
		parentAgent?: { name: string; open: () => void };
		queue?: string[];
		queueImages?: string[][];
		onopenturn?: (changes: TurnChanges) => void;
		onopensubagent?: (id: string) => void;
		onremove?: (index: number, text: string, images: string[]) => void;
		/** Answers something the agent asked: one answer per question. */
		onanswer?: (question: string, answers: string[]) => unknown;
		questionTarget?: { id: string; done(): void };
		following?: boolean;
	} = $props();

	const workspaceFiles = changedFiles();
	const expanded = new SvelteSet<number>();

	/**
	 * Where a part's pictures are served: at an address of the part's own, since an agent may
	 * write the same file again, and the browser would show what it had for an address before.
	 */
	const picturesAt = (at: string) => pictures && `${pictures}?at=${at}`;

	function activitySummary(parts: Part[]) {
		const messages = parts.filter((part) => part.kind === 'text').length;
		const plans = parts.filter((part) => part.kind === 'plan').length;
		const calls = parts.reduce(
			(sum, part) => sum + (part.kind === 'tools' ? part.tools.length : 0),
			0
		);
		return [
			messages && `${messages} message${messages === 1 ? '' : 's'}`,
			plans && `${plans} plan${plans === 1 ? '' : 's'}`,
			calls && `${calls} tool call${calls === 1 ? '' : 's'}`
		]
			.filter(Boolean)
			.join(' · ');
	}

	let reveal = $state<{ id: string; done: () => void }>();
	const backgroundIds = $derived(
		background.flatMap((task) => (task.toolCallId ? [task.toolCallId] : []))
	);
	const backgroundRows = $derived(
		background.map((task) => {
			const fallback =
				task.label ||
				(task.type === 'terminal'
					? 'Terminal'
					: task.type === 'subagent'
						? 'Subagent'
						: 'Tool call');
			for (const [index, block] of blocks.entries()) {
				if (block.kind !== 'agent') continue;
				for (const part of block.parts) {
					if (task.type === 'subagent' && part.kind === 'subagent' && part.id === task.id)
						return {
							task,
							label: part.title || fallback,
							kind: 'Subagent',
							open: onopensubagent && (() => onopensubagent?.(task.id))
						};
					if (part.kind !== 'tools' || !task.toolCallId) continue;
					const tool = part.tools.find((tool) => tool.id === task.toolCallId);
					if (tool)
						return {
							task,
							label: task.label || toolSummary(tool.input, cwd) || tool.name,
							kind:
								task.type === 'terminal' || /^(shell|bash|exec_command)$/i.test(tool.name)
									? 'Terminal'
									: tool.name,
							open: () => {
								following = false;
								expanded.add(index);
								list?.scrollToIndex(index);
								reveal = { id: tool.id, done: () => (reveal = undefined) };
							}
						};
				}
			}
			return {
				task,
				label: fallback,
				kind:
					task.type === 'terminal' ? 'Terminal' : task.type === 'subagent' ? 'Subagent' : 'Tool',
				open: undefined
			};
		})
	);

	function toggleActivity(index: number) {
		if (expanded.has(index)) expanded.delete(index);
		else {
			following = false;
			expanded.add(index);
		}
	}

	// Some providers announce the reviewer without forwarding its assignment.
	const assignmentIndex = $derived(
		parentAgent ? blocks.findIndex((block) => block.kind === 'user' && block.delegated) : -1
	);

	type AgentBlock = Extract<Block, { kind: 'agent' }>;
	/** The latest reply says where it ends at all times; earlier ones when the pointer is on them. */
	const latestReply = $derived(blocks.findLastIndex((block) => block.kind === 'agent'));
	const fade = 'transition-opacity pointer-fine:opacity-0 pointer-fine:focus-within:opacity-100';
	const quietReply = `${fade} pointer-fine:group-hover/reply:opacity-100`;

	const rows = $derived([
		...blocks.map((block) => ({ kind: 'block' as const, block })),
		...queue.map((text, index) => ({
			kind: 'queue' as const,
			text,
			index,
			images: queueImages[index] ?? []
		}))
	]);
	let list: VirtualizerHandle | undefined = $state();
	// A fresh view, including a workspace switch, starts at the latest message.
	onMount(toLatest);
	let previousOffset = 0;
	let scroller: HTMLDivElement;
	let frame = 0;
	onDestroy(() => cancelAnimationFrame(frame));

	function followLatest() {
		cancelAnimationFrame(frame);
		// ResizeObserver runs during layout. Scroll on the next frame to avoid resize loops.
		frame = requestAnimationFrame(() => {
			if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	}

	export function toLatest() {
		following = true;
		followLatest();
	}

	$effect(() => {
		const target = questionTarget;
		if (!target || !list) return;
		const index = blocks.findIndex(
			(block) =>
				block.kind === 'agent' &&
				block.parts.some((part) => part.kind === 'question' && part.id === target.id)
		);
		if (index < 0) return;
		following = false;
		expanded.add(index);
		list.scrollToIndex(index);
	});

	function scrolled(offset: number) {
		if (!list) return;
		const atBottom = list.getScrollSize() - offset - list.getViewportSize() < 80;
		// Size measurements can move the bottom away. Only scrolling upwards stops following.
		if (offset < previousOffset && !atBottom) following = false;
		else if (atBottom) following = true;
		previousOffset = offset;
	}

	$effect(() => {
		void rows;
		// Wait for Virtua to receive the new rows before asking for the last one.
		untrack(() => {
			void tick().then(followLatest);
		});
	});
</script>

{#snippet tokens(usage: TurnUsage)}
	<p>{tokenSummary(usage)}</p>
	<p class="text-muted">{tokenBreakdown(usage)}</p>
{/snippet}

<!-- Where a reply ends: its last words to copy, and how long it took, with what it used on hover. -->
{#snippet byline(reply: AgentBlock, text: string, latest: boolean)}
	{@const usage = reply.usage}
	{@const turn = reply.changes}
	<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
		{#if turn && onopenturn}
			{@const files = turn.diff.files}
			{@const summary = files.length === 1 ? '1 file changed' : `${files.length} files changed`}
			<button
				type="button"
				class="inline-flex max-w-full items-center gap-2 rounded-control bg-hover px-2.5 py-1 text-ink hover:bg-sunken"
				title={`Review turn ${turn.number} · ${summary}`}
				aria-label={`Review turn ${turn.number}, ${files.length === 1 ? files[0].path + ', ' : ''}${summary}, ${turn.diff.added} lines added, ${turn.diff.removed} removed`}
				onclick={() => onopenturn?.(turn)}
			>
				<span class="icon-[lucide--file-diff] size-3.5 shrink-0 text-muted"></span>
				{#if files.length === 1}
					<span class="truncate code-dense" title={files[0].path}>
						{files[0].path.split('/').at(-1)}
					</span>
				{:else}
					<span class="font-medium">{summary}</span>
				{/if}
				<DiffStat added={turn.diff.added} removed={turn.diff.removed} />
			</button>
		{/if}
		<div class={['flex items-center gap-2', !latest && quietReply]}>
			{#if text}<MessageCopy {text} />{/if}
			{#if reply.took !== undefined}
				{#if usage}
					<Tooltip>
						{duration(reply.took)}
						{#snippet tip()}{@render tokens(usage)}{/snippet}
					</Tooltip>
				{:else}
					<span>{duration(reply.took)}</span>
				{/if}
			{:else if usage}
				<!-- from before turns said when they began: what it used is all there is to say -->
				<span title={tokenBreakdown(usage)}>{tokenSummary(usage)}</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet agentPart(
	part: Part,
	dimmed: boolean,
	live: boolean,
	at: string,
	ending: { reply: AgentBlock; latest: boolean } | undefined
)}
	{@const pictures = picturesAt(at)}
	{#if part.kind === 'text'}
		{#snippet footer()}{#if ending}{@render byline(
					ending.reply,
					part.text,
					ending.latest
				)}{/if}{/snippet}
		<AgentText text={part.text} footer={ending ? footer : undefined}>
			<Markdown agentDirectives preserveLineBreaks text={part.text} {dimmed} {pictures} />
		</AgentText>
	{:else if part.kind === 'subagent'}
		<SubagentRow child={part} {cwd} {pictures} onopen={onopensubagent} />
	{:else if part.kind === 'tools'}
		<!-- live: the agent is at work, and this is the last thing it did -->
		<ToolGroup
			{PatchView}
			workspace={workspaceFiles}
			tools={part.tools}
			{cwd}
			{live}
			{reveal}
			{backgroundIds}
		/>
	{:else if part.kind === 'plan'}
		{#key part.id}
			<PlanCard plan={part.plan} {pictures} />
		{/key}
	{:else if part.kind === 'question'}
		<QuestionCard
			onreveal={questionTarget?.id === part.id ? questionTarget.done : undefined}
			questions={part.questions}
			answers={part.answers}
			open={part.open && !!onanswer}
			delivery={part.delivery}
			blocking={part.blocking}
			onanswer={(answers) => onanswer?.(part.id, answers)}
		/>
	{:else}
		<Notice>{part.error}</Notice>
	{/if}
{/snippet}

<div bind:this={scroller} class="scroller">
	<Virtualizer
		bind:this={list}
		data={rows}
		as="ol"
		item="li"
		onscroll={scrolled}
		onresize={followLatest}
		itemProps={({ index }) => ({ 'aria-posinset': index + 1, 'aria-setsize': rows.length })}
	>
		{#snippet children(row, i)}
			<div
				class={[
					'mx-auto w-full max-w-5xl pr-16.5 pl-5',
					i === 0 ? 'pt-6' : 'pt-8',
					i === rows.length - 1 && 'pb-6'
				]}
			>
				{#if row.kind === 'block'}
					{@const block = row.block}
					<div>
						{#if parentAgent && i === Math.max(0, assignmentIndex)}
							<div class={['flex pb-1', block.kind === 'user' && 'justify-end']}>
								<button
									type="button"
									onclick={parentAgent.open}
									title="Open parent conversation"
									class="inline-flex items-center gap-1.5 rounded-control text-xs text-muted hover:text-ink hover:underline"
								>
									<span class="icon-[lucide--git-branch] size-3.5"></span>
									Assigned by {parentAgent.name}
								</button>
							</div>
						{/if}
						{#if block.kind === 'user'}
							{#if block.from || (block.delegated && i !== assignmentIndex)}
								<!-- not the person's words: another agent's, and whose -->
								{@const title = block.from && senders?.[block.from]}
								<p class="flex items-center justify-end gap-1.5 pb-1 text-xs text-muted">
									<span class="icon-[lucide--bot] size-3.5"></span>
									{#if block.from && !block.from.startsWith('external:') && (title || block.senderName)}
										<span>
											{title ? 'From the agent in “' : 'From '}<a
												href={resolve(`/workspaces/[id]?agent=${encodeURIComponent(block.from)}`, {
													id: block.from
												})}
												class="rounded-control hover:text-ink hover:underline focus-visible:underline"
											>
												{title || block.senderName}
											</a>{title ? '”' : ''}
										</span>
									{:else}
										{block.senderName ? `From ${block.senderName}` : 'From another agent'}
									{/if}
								</p>
							{/if}
							<UserMessage text={block.text}>
								{#if block.text}<Markdown preserveLineBreaks text={block.text} {pictures} />{/if}
								<MessageImages images={block.images} />
							</UserMessage>
						{:else if block.kind === 'note'}
							<!-- something that happened to the workspace: said in passing, between the two -->
							<p class="flex items-center gap-3 text-xs text-muted">
								<span class="h-px flex-1 bg-line"></span>
								{block.text}
								<span class="h-px flex-1 bg-line"></span>
							</p>
						{:else}
							{@const lastText = block.parts.findLastIndex((part) => part.kind === 'text')}
							{@const live = running && !block.changes && i === blocks.length - 1}
							{@const last = block.parts.at(-1)}
							{@const hiddenCount = live
								? 0
								: block.parts.length - (last && last.kind !== 'tools' ? 1 : 0)}
							{@const hidden = block.parts
								.slice(0, hiddenCount)
								.filter((part) => part.kind !== 'subagent')}
							<!-- said where the reply ends: beside its last words, else on its own -->
							{@const ending = live ? undefined : { reply: block, latest: i === latestReply }}
							<AgentMessage {agent}>
								{#if hidden.length}
									<TurnActivity
										summary={activitySummary(hidden)}
										expanded={expanded.has(i)}
										ontoggle={() => toggleActivity(i)}
									/>
								{/if}
								{#each block.parts as part, j (j)}
									{#if part.kind === 'subagent' || j >= hiddenCount || expanded.has(i)}
										{@render agentPart(
											part,
											j !== lastText,
											live && j === block.parts.length - 1,
											`${i}.${j}`,
											j === block.parts.length - 1 ? ending : undefined
										)}
									{/if}
								{/each}
								{#if ending && last?.kind !== 'text'}
									<div>{@render byline(ending.reply, '', ending.latest)}</div>
								{/if}
							</AgentMessage>
						{/if}
					</div>
				{:else}
					{@const { text, index, images } = row}
					<div class="ml-auto message ring-1 ring-line">
						<p class="label">Queued</p>
						{#if text}<Markdown preserveLineBreaks {text} {pictures} dimmed />{/if}
						<MessageImages {images} />
					</div>
					<div class="mt-1 flex items-center justify-end gap-1">
						{#if text}<MessageCopy {text} />{/if}
						{#if onremove}<Button
								variant="ghost"
								size="sm"
								icon="icon-[lucide--x]"
								label="Don't send this"
								onclick={() => onremove?.(index, text, images)}
							/>{/if}
					</div>
				{/if}
			</div>
		{/snippet}
	</Virtualizer>
</div>
{#if showJump && !following}
	<div class="relative mx-auto w-full max-w-5xl">
		<Button
			icon="icon-[lucide--arrow-down]"
			label="Jump to latest"
			onclick={toLatest}
			class="absolute right-5 bottom-2 bg-surface shadow-float"
		/>
	</div>
{/if}
{#if backgroundRows.length}
	<BackgroundTasks rows={backgroundRows} {onstoptask} {withComposer} />
{/if}
