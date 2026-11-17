<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import type { Agent } from '@geordi/protocol';
	import type { Block } from '#lib/transcript.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import MessageImages from '#lib/components/MessageImages.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';

	let {
		blocks,
		agent,
		running = false,
		cwd,
		senders,
		queue = [],
		queueImages = [],
		onremove,
		following = $bindable(true)
	}: {
		blocks: Block[];
		agent: Agent;
		running?: boolean;
		cwd?: string;
		senders?: Record<string, string>;
		queue?: string[];
		queueImages?: string[][];
		onremove: (index: number, text: string, images: string[]) => void;
		following?: boolean;
	} = $props();

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
								{#if block.text}<p class="whitespace-pre-wrap">{block.text}</p>{/if}
								<MessageImages images={block.images} />
							</div>
						{:else if block.kind === 'note'}
							<!-- something that happened to the workspace: said in passing, between the two -->
							<p class="flex items-center gap-3 text-xs text-muted">
								<span class="h-px flex-1 bg-line"></span>
								{block.text}
								<span class="h-px flex-1 bg-line"></span>
							</p>
						{:else}
							{@const lastText = block.parts.findLastIndex((part) => part.kind === 'text')}
							<div class="flex gap-3.5">
								<AgentAvatar {agent} />
								<div class="min-w-0 flex-1 space-y-3 pt-0.5">
									{#each block.parts as part, j (j)}
										{#if part.kind === 'text'}
											<Markdown text={part.text} dimmed={j !== lastText} />
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
					</div>
				{:else}
					{@const { text, index, images } = row}
					<div class="flex items-start justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							icon="icon-[lucide--x]"
							label="Don't send this"
							onclick={() => onremove(index, text, images)}
							class="mt-1.5"
						/>
						<div class="message ring-1 ring-line">
							<p class="label">Queued</p>
							<p class="whitespace-pre-wrap text-muted">{text}</p>
							<MessageImages {images} />
						</div>
					</div>
				{/if}
			</div>
		{/snippet}
	</Virtualizer>
</div>
