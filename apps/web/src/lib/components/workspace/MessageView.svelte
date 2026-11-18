<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import type { Agent } from '@geordi/protocol';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Block, Part } from '#lib/transcript.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import MessageImages from '#lib/components/MessageImages.svelte';
	import MessageCopy from './MessageCopy.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import QuestionCard from '#lib/components/QuestionCard.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';

	let {
		blocks,
		agent,
		running = false,
		cwd,
		pictures,
		senders,
		queue = [],
		queueImages = [],
		onremove,
		onanswer,
		following = $bindable(true)
	}: {
		blocks: Block[];
		agent: Agent;
		running?: boolean;
		cwd?: string;
		/** Where the pictures the agent refers to are served. */
		pictures?: string;
		senders?: Record<string, string>;
		queue?: string[];
		queueImages?: string[][];
		onremove: (index: number, text: string, images: string[]) => void;
		/** Answers something the agent asked: one answer per question. */
		onanswer: (question: string, answers: string[]) => unknown;
		following?: boolean;
	} = $props();

	const expanded = new SvelteSet<number>();

	function activitySummary(parts: Part[]) {
		const messages = parts.filter((part) => part.kind === 'text').length;
		const calls = parts.reduce(
			(sum, part) => sum + (part.kind === 'tools' ? part.tools.length : 0),
			0
		);
		return [
			messages && `${messages} message${messages === 1 ? '' : 's'}`,
			calls && `${calls} tool call${calls === 1 ? '' : 's'}`
		]
			.filter(Boolean)
			.join(' · ');
	}

	function toggleActivity(index: number) {
		if (expanded.has(index)) expanded.delete(index);
		else {
			following = false;
			expanded.add(index);
		}
	}

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
			<Markdown text={part.text} {dimmed} {pictures} />
			{#if part.text}{@render messageActions(part.text)}{/if}
		</div>
	{:else if part.kind === 'tools'}
		<!-- live: the agent is at work, and this is the last thing it did -->
		<ToolGroup tools={part.tools} {cwd} {live} />
	{:else if part.kind === 'question'}
		<QuestionCard
			questions={part.questions}
			answers={part.answers}
			open={part.open}
			onanswer={(answers) => onanswer(part.id, answers)}
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
							<div class="ml-auto message bg-bubble">
								{#if block.text}<Markdown text={block.text} {pictures} />{/if}
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
							<div class="flex gap-3.5">
								<AgentAvatar {agent} />
								<div class="min-w-0 flex-1 space-y-3 pt-0.5">
									{#if hiddenCount}
										<button
											type="button"
											class="flex h-7 items-center gap-1.5 rounded-control text-xs text-muted hover:text-ink"
											aria-expanded={expanded.has(i)}
											onclick={() => toggleActivity(i)}
										>
											Turn activity
											<span class="text-muted"
												>{activitySummary(block.parts.slice(0, hiddenCount))}</span
											>
											<span
												class={[
													'icon-[lucide--chevron-right] size-3.5',
													expanded.has(i) && 'rotate-90'
												]}
											></span>
										</button>
									{/if}
									{#each block.parts as part, j (j)}
										{#if j >= hiddenCount || expanded.has(i)}
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
						{#if text}<Markdown {text} {pictures} dimmed />{/if}
						<MessageImages {images} />
					</div>
					{@render messageActions(text, true, () => onremove(index, text, images))}
				{/if}
			</div>
		{/snippet}
	</Virtualizer>
</div>
