<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import BackgroundTasks from './BackgroundTasks.svelte';
	import { toolSummary } from '@geordi/ui/tools';
	import type { Agent, BackgroundTask, TurnUsage } from '@geordi/protocol';
	import { tokenBreakdown, tokenSummary } from '#lib/tokens.ts';
	import type { SenderDetails } from '#lib/server/workspace-projection.ts';
	import { agentName, duration, relativeAge } from '#lib/format.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { messageRows, type ChildExchange } from '#lib/message-rows.ts';
	import type { Block, Part, TurnChanges } from '#lib/transcript.ts';
	import AgentText from '@geordi/ui/AgentText.svelte';
	import AgentMessage from '@geordi/ui/AgentMessage.svelte';
	import UserMessage from '@geordi/ui/UserMessage.svelte';
	import IncomingMessage from '@geordi/ui/IncomingMessage.svelte';
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
	import Spinner from '@geordi/ui/Spinner.svelte';
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
		childSenders = {},
		queueSenders = [],
		queueDetails = [],
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
		childSenders?: Record<string, string>;
		queueSenders?: (string | null)[];
		queueDetails?: (SenderDetails | null)[];
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

	let selectedQuestion = $state<{ id: string; done(): void }>();
	const targetQuestion = $derived(questionTarget ?? selectedQuestion);
	const pendingQuestions = $derived(
		onanswer
			? blocks.flatMap((block) =>
					block.kind === 'agent'
						? block.parts.filter(
								(part): part is Extract<Part, { kind: 'question' }> =>
									part.kind === 'question' && part.open
							)
						: []
				)
			: []
	);

	const workspaceFiles = changedFiles();
	const expanded = new SvelteSet<number>();
	const openMessages = new SvelteSet<string>();

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
								list?.scrollToIndex(rowForBlock(index));
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

	const rows = $derived(
		messageRows(blocks, childSenders, queue, queueSenders, queueImages, queueDetails)
	);
	function isIncoming(row?: (typeof rows)[number]) {
		return (
			row?.kind === 'child' ||
			(row?.kind === 'block' &&
				row.block.kind === 'user' &&
				!!(row.block.from || row.block.delegated))
		);
	}
	function rowForBlock(index: number) {
		return rows.findIndex((row) => row.kind === 'block' && row.index === index);
	}
	let list: VirtualizerHandle | undefined = $state();
	// A fresh view, including a workspace switch, starts at the latest message.
	onMount(toLatest);
	let now = $state(Date.now());
	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});
	let previousOffset = 0;
	let scroller: HTMLDivElement;
	let frame = 0;
	onDestroy(() => cancelAnimationFrame(frame));

	function followLatest() {
		if (frame) return;
		// ResizeObserver runs during layout. Scroll on the next frame to avoid resize loops.
		frame = requestAnimationFrame(() => {
			frame = 0;
			if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	}

	export function toLatest() {
		following = true;
		// Move now so a pending scroll event sees the new position.
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
		followLatest();
	}

	$effect(() => {
		const target = targetQuestion;
		if (!target || !list) return;
		const index = blocks.findIndex(
			(block) =>
				block.kind === 'agent' &&
				block.parts.some((part) => part.kind === 'question' && part.id === target.id)
		);
		if (index < 0) return;
		following = false;
		expanded.add(index);
		list.scrollToIndex(rowForBlock(index));
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

{#snippet senderDetails(details?: SenderDetails)}
	{#if details}
		<span class="block text-xs text-muted">
			{[
				agentName[details.agent],
				details.model,
				details.effort ? details.effort + ' effort' : 'Default effort'
			]
				.filter(Boolean)
				.join(' · ')}
		</span>
	{/if}
{/snippet}

{#snippet childExchange(exchange: ChildExchange, first: boolean)}
	{@const { key, name, from, messages } = exchange}
	{@const last = messages[messages.length - 1]}
	{@const status = last.report ?? (messages.length === 1 ? 'sent a message' : 'sent messages')}
	{@const open = openMessages.has(key)}
	{@const text = messages
		.map((message) => message.text)
		.filter(Boolean)
		.join('\n\n')}
	<IncomingMessage
		{first}
		fold={{
			open,
			toggle: () => {
				if (open) openMessages.delete(key);
				else {
					following = false;
					openMessages.add(key);
				}
			}
		}}
	>
		{#snippet heading()}
			<span class="font-medium text-ink">{name}</span>
			{status}{last.queued ? ' (queued)' : ''}
			{@render senderDetails(last.senderDetails)}
		{/snippet}
		<div class="space-y-3">
			{#each messages as message, index (index)}
				<div>
					{#if message.report && messages.length > 1}<p class="label">
							{message.report === 'finished' ? 'Finished' : 'Stopped'}
						</p>{/if}
					{#if message.queued}<p class="label">Queued</p>{/if}
					{#if message.text}<Markdown preserveLineBreaks text={message.text} {pictures} />{/if}
					<MessageImages images={message.images} />
					{#if message.queued && onremove}
						{@const queued = message.queued}
						<Button
							variant="ghost"
							size="sm"
							icon="icon-[lucide--x]"
							label="Don't send this"
							onclick={() => onremove?.(queued.index, queued.text, queued.images)}
						/>
					{/if}
				</div>
			{/each}
		</div>
		{#snippet footer()}
			<a
				href={resolve(`/workspaces/[id]?agent=${encodeURIComponent(from)}`, { id: from })}
				class="quiet-action text-xs"
				aria-label={`Open ${name} workspace`}
			>
				<span aria-hidden="true" class="icon-[lucide--git-branch] size-3.5"></span>{name}
			</a>
			{#if text}<MessageCopy {text} />{/if}
		{/snippet}
	</IncomingMessage>
{/snippet}

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
			{#if reply.endedAt}
				<time datetime={reply.endedAt}>{relativeAge(reply.endedAt, now)}</time>
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
			onreveal={targetQuestion?.id === part.id ? targetQuestion.done : undefined}
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
			{@const incoming = isIncoming(row)}
			{@const previousIncoming = isIncoming(rows[i - 1])}
			<div
				class={[
					'mx-auto w-full max-w-5xl pl-5',
					incoming ? 'pr-5' : 'pr-16.5',
					{
						'pt-6': i === 0,
						'pt-2': incoming && previousIncoming,
						'pt-4': i > 0 && incoming !== previousIncoming,
						'pt-8': i > 0 && !incoming && !previousIncoming
					},
					i === rows.length - 1 && 'pb-6'
				]}
			>
				{#if row.kind === 'block'}
					{@const block = row.block}
					<div>
						{#if parentAgent && assignmentIndex < 0 && i === 0}
							<div class={['flex pb-1', block.kind === 'user' && 'justify-end']}>
								<button
									type="button"
									onclick={parentAgent.open}
									title="Open parent conversation"
									class="quiet-action text-xs"
								>
									<span class="icon-[lucide--git-branch] size-3.5"></span>
									Assigned by {parentAgent.name}
								</button>
							</div>
						{/if}
						{#if block.kind === 'user'}
							{@const title = (block.from && senders?.[block.from]) || block.senderName}
							{#snippet body()}
								{#if block.text}<Markdown preserveLineBreaks text={block.text} {pictures} />{/if}
								<MessageImages images={block.images} />
							{/snippet}
							{#if incoming}
								<IncomingMessage first={!previousIncoming}>
									{#snippet heading()}
										{#if block.from && !block.from.startsWith('external:')}
											<a
												href={resolve(`/workspaces/[id]?agent=${encodeURIComponent(block.from)}`, {
													id: block.from
												})}
												class="rounded-control font-medium text-ink hover:underline focus-visible:underline"
											>
												{title || 'Another agent'}
											</a>
										{:else if block.delegated && parentAgent}
											<button
												type="button"
												onclick={parentAgent.open}
												class="rounded-control font-medium text-ink hover:underline focus-visible:underline"
											>
												{row.index === assignmentIndex ? 'Assigned by ' : ''}{parentAgent.name}
											</button>
										{:else}
											<span class="font-medium text-ink">{title || 'Another agent'}</span>
										{/if}
										{@render senderDetails(block.senderDetails)}
									{/snippet}
									{@render body()}
									{#snippet footer()}{#if block.text}<MessageCopy
												text={block.text}
											/>{/if}{/snippet}
								</IncomingMessage>
							{:else}
								<UserMessage text={block.text}>{@render body()}</UserMessage>
							{/if}
						{:else if block.kind === 'note'}
							<!-- something that happened to the workspace: said in passing, between the two -->
							<p class="flex items-center gap-3 text-xs text-muted">
								<span class="h-px flex-1 bg-line"></span>
								<span class="flex items-center gap-1.5">
									{#if block.working}<span class="flex" aria-hidden="true"><Spinner /></span>{/if}
									{block.text}
								</span>
								<span class="h-px flex-1 bg-line"></span>
							</p>
						{:else}
							{@const lastText = block.parts.findLastIndex((part) => part.kind === 'text')}
							{@const live = running && !block.changes && row.index === blocks.length - 1}
							{@const last = block.parts.at(-1)}
							{@const hiddenCount = live
								? 0
								: block.parts.length - (last && last.kind !== 'tools' ? 1 : 0)}
							{@const hidden = block.parts
								.slice(0, hiddenCount)
								.filter((part) => part.kind !== 'subagent')}
							<!-- said where the reply ends: beside its last words, else on its own -->
							{@const ending = live
								? undefined
								: { reply: block, latest: row.index === latestReply }}
							<AgentMessage {agent}>
								{#if hidden.length}
									<TurnActivity
										summary={activitySummary(hidden)}
										expanded={expanded.has(row.index)}
										ontoggle={() => toggleActivity(row.index)}
									/>
								{/if}
								{#each block.parts as part, j (j)}
									{#if part.kind === 'subagent' || j >= hiddenCount || expanded.has(row.index)}
										{@render agentPart(
											part,
											j !== lastText,
											live && j === block.parts.length - 1,
											`${row.index}.${j}`,
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
				{:else if row.kind === 'child'}
					{@render childExchange(row, !previousIncoming)}
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
{#if pendingQuestions.length}
	<nav aria-label="Pending questions" class="mx-auto w-full max-w-5xl shrink-0 px-5 pb-2">
		<div class="mx-1 rounded-card bg-sidebar px-3 py-2">
			<p class="flex items-center gap-2 text-sm font-semibold text-ink">
				<span
					aria-hidden="true"
					class="icon-[lucide--message-circle-question-mark] size-4 text-accent"
				></span>
				{pendingQuestions.length === 1 ? 'Pending question' : 'Pending questions'}
			</p>
			<ul aria-label="Open requests" class="max-h-24 overflow-y-auto">
				{#each pendingQuestions as part (part.id)}
					<li>
						<button
							type="button"
							class="item w-full gap-2 px-2 py-1 text-left text-sm"
							onclick={() =>
								(selectedQuestion = { id: part.id, done: () => (selectedQuestion = undefined) })}
						>
							<span class="min-w-0 flex-1 truncate">{part.questions[0]?.question}</span>
							<span
								aria-hidden="true"
								class="icon-[lucide--arrow-up-right] size-4 shrink-0 text-muted"
							></span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</nav>
{/if}
{#if backgroundRows.length}
	<BackgroundTasks rows={backgroundRows} {onstoptask} {withComposer} />
{/if}
