<script lang="ts">
	import type { AgentPlan } from '@geordi/protocol';
	import Markdown from './Markdown.svelte';

	let { plan, pictures }: { plan: AgentPlan; pictures?: string } = $props();
	const entries = $derived(plan.type === 'items' ? plan.entries : []);
	const completed = $derived(entries.filter((entry) => entry.status === 'completed').length);
	const done = $derived(entries.length > 0 && completed === entries.length);
	const current = $derived(entries.find((entry) => entry.status === 'in_progress'));
	let open = $derived(!done);

	const icons: Record<string, string> = {
		in_progress: 'icon-[lucide--circle-dot] text-accent-ink',
		completed: 'icon-[lucide--check]',
		cancelled: 'icon-[lucide--minus]'
	};
</script>

<details bind:open class="rounded-card bg-sunken px-3 py-2 text-sm">
	<summary class="flex items-center gap-2">
		<span class="icon-[lucide--list-checks] size-4 shrink-0 text-muted"></span>
		<span class="font-medium">{done ? 'Plan complete' : 'Plan'}</span>
		{#if entries.length}
			<span class="text-xs text-muted">{completed} of {entries.length}</span>
		{/if}
		{#if !open && current}
			<span class="min-w-0 truncate text-muted">{current.content}</span>
		{/if}
		<span
			class={[
				'ml-auto icon-[lucide--chevron-right] size-4 shrink-0 text-muted',
				open && 'rotate-90'
			]}
		></span>
	</summary>
	{#if plan.type === 'markdown'}
		<div class="pt-2"><Markdown text={plan.content} {pictures} /></div>
	{:else}
		<ol class="space-y-1.5 pt-2">
			{#each entries as entry, index (index)}
				{@const active = entry.status === 'in_progress'}
				<li
					class={[
						'flex items-baseline gap-2 break-words',
						active ? 'font-medium text-ink' : 'text-muted'
					]}
					aria-current={active ? 'step' : undefined}
				>
					<span
						class={[
							'mt-1 size-3.5 shrink-0 self-start',
							icons[entry.status] ?? 'icon-[lucide--circle]'
						]}
					></span>
					<span class="min-w-0"
						><span class="sr-only">{entry.status.replaceAll('_', ' ')}. </span>{entry.content}</span
					>
				</li>
			{/each}
		</ol>
	{/if}
</details>
