<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import Disclosure from '#lib/ui/Disclosure.svelte';
	import { toolSummary } from '#lib/tools.ts';
	import type { Agent, BackgroundTask } from '@geordi/protocol';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Block, Part } from '#lib/transcript.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import MessageImages from '#lib/components/MessageImages.svelte';
	import MessageCopy from './MessageCopy.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import PlanCard from '#lib/components/PlanCard.svelte';
	import QuestionCard from '#lib/components/QuestionCard.svelte';
	import SubagentRow from '#lib/components/SubagentRow.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';

	let {
		blocks,
		background = [],
		agent,
		running = false,
		cwd,
		pictures,
		senders,
		parentAgent,
		queue = [],
		queueImages = [],
		onopensubagent,
		onremove,
		onanswer,
		following = $bindable(true)
	}: {
		blocks: Block[];
		background?: BackgroundTask[];
		agent: Agent;
		running?: boolean;
		cwd?: string;
		/** Where the pictures the agent refers to are served. */
		pictures?: string;
		senders?: Record<string, string>;
		parentAgent?: { name: string; open: () => void };
		queue?: string[];
		queueImages?: string[][];
		onopensubagent?: (id: string) => void;
		onremove?: (index: number, text: string, images: string[]) => void;
		/** Answers something the agent asked: one answer per question. */
		onanswer?: (question: string, answers: string[]) => unknown;
		following?: boolean;
	} = $props();

	const expanded = new SvelteSet<number>();

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
							open: onopensubagent && (() => onopensubagent?.(task.id))
						};
					if (part.kind !== 'tools' || !task.toolCallId) continue;
					const tool = part.tools.find((tool) => tool.id === task.toolCallId);
					if (tool)
						return {
							task,
							label: task.label || toolSummary(tool.input, cwd) || tool.name,
							open: () => {
								following = false;
								expanded.add(index);
								list?.scrollToIndex(index);
								reveal = { id: tool.id, done: () => (reveal = undefined) };
							}
						};
				}
			}
			return { task, label: fallback, open: undefined };
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

{#snippet messageActions(text: string, outgoing = false, remove?: () => void)}
	<div class={['mt-1 flex items-center gap-1', outgoing && 'justify-end']}>
		{#if text}<MessageCopy {text} />{/if}
		{#if remove}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--x]"
				label="Don't send this"
				onclick={remove}
			/>
		{/if}
	</div>
{/snippet}

{#snippet agentPart(part: Part, dimmed: boolean, live: boolean)}
	{#if part.kind === 'text'}
		<div>
			<Markdown preserveLineBreaks text={part.text} {dimmed} {pictures} />
			{#if part.text}{@render messageActions(part.text)}{/if}
		</div>
	{:else if part.kind === 'subagent'}
		<SubagentRow child={part} {cwd} {pictures} onopen={onopensubagent} />
	{:else if part.kind === 'tools'}
		<!-- live: the agent is at work, and this is the last thing it did -->
		<ToolGroup tools={part.tools} {cwd} {live} {reveal} {backgroundIds} />
	{:else if part.kind === 'plan'}
		{#key part.id}
			<PlanCard plan={part.plan} {pictures} />
		{/key}
	{:else if part.kind === 'question'}
		<QuestionCard
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
								<p class="flex items-center justify-end gap-1.5 pb-1 text-xs text-muted">
									<span class="icon-[lucide--bot] size-3.5"></span>
									{block.from && senders?.[block.from]
										? `From the agent in “${senders[block.from]}”`
										: 'From another agent'}
								</p>
							{/if}
							<div class="ml-auto message bg-bubble">
								{#if block.text}<Markdown preserveLineBreaks text={block.text} {pictures} />{/if}
								<MessageImages images={block.images} />
							</div>
							{#if block.text}{@render messageActions(block.text, true)}{/if}
						{:else if block.kind === 'note'}
							<!-- something that happened to the workspace: said in passing, between the two -->
							<p class="flex items-center gap-3 text-xs text-muted">
								<span class="h-px flex-1 bg-line"></span>
								{block.text}
								<span class="h-px flex-1 bg-line"></span>
							</p>
						{:else}
							{@const lastText = block.parts.findLastIndex((part) => part.kind === 'text')}
							{@const live = running && i === blocks.length - 1}
							{@const last = block.parts.at(-1)}
							{@const hiddenCount = live
								? 0
								: block.parts.length - (last && last.kind !== 'tools' ? 1 : 0)}
							{@const hidden = block.parts
								.slice(0, hiddenCount)
								.filter((part) => part.kind !== 'subagent')}
							<div class="flex gap-3.5">
								<AgentAvatar {agent} />
								<div class="min-w-0 flex-1 space-y-3 pt-0.5">
									{#if hidden.length}
										<button
											type="button"
											class="flex h-7 items-center gap-1.5 rounded-control text-xs text-muted hover:text-ink"
											aria-expanded={expanded.has(i)}
											onclick={() => toggleActivity(i)}
										>
											Turn activity
											<span class="text-muted">{activitySummary(hidden)}</span>
											<span
												class={[
													'icon-[lucide--chevron-right] size-3.5',
													expanded.has(i) && 'rotate-90'
												]}
											></span>
										</button>
									{/if}
									{#each block.parts as part, j (j)}
										{#if part.kind === 'subagent' || j >= hiddenCount || expanded.has(i)}
											{@render agentPart(
												part,
												j !== lastText,
												live && j === block.parts.length - 1
											)}
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{:else}
					{@const { text, index, images } = row}
					<div class="ml-auto message ring-1 ring-line">
						<p class="label">Queued</p>
						{#if text}<Markdown preserveLineBreaks {text} {pictures} dimmed />{/if}
						<MessageImages {images} />
					</div>
					{@render messageActions(text, true, onremove && (() => onremove(index, text, images)))}
				{/if}
			</div>
		{/snippet}
	</Virtualizer>
</div>
{#if backgroundRows.length}
	<div class="mx-auto w-full max-w-5xl shrink-0 px-5 pb-2">
		<Disclosure summaryClass="w-fit gap-1.5 px-1 py-1 text-xs text-muted hover:text-ink">
			{#snippet heading()}
				<span class="icon-[lucide--activity] size-3.5"></span>
				{backgroundRows.length} background {backgroundRows.length === 1 ? 'task' : 'tasks'}
			{/snippet}
			<ul class="max-h-32 overflow-auto px-1">
				{#each backgroundRows as row (row.task.type + row.task.id)}
					<li class="flex items-center gap-2 py-1 text-sm text-muted">
						<span
							class={[
								'size-3.5 shrink-0',
								row.task.type === 'subagent'
									? 'icon-[lucide--git-branch]'
									: 'icon-[lucide--terminal]'
							]}
						></span>
						{#if row.open}
							<button
								type="button"
								class="truncate hover:text-ink hover:underline"
								title={row.label}
								onclick={row.open}>{row.label}</button
							>
						{:else}
							<span class="truncate" title={row.label}>{row.label}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</Disclosure>
	</div>
{/if}
