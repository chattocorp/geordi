<script lang="ts">
	import type { BackgroundTask } from '@geordi/protocol';
	import { toolIcon } from '#lib/tools.ts';
	import Button from '#lib/ui/Button.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Disclosure from '#lib/ui/Disclosure.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Row = { task: BackgroundTask; label: string; kind: string; open?: () => void };
	let {
		rows,
		withComposer,
		onstoptask
	}: { onstoptask?: (id: string) => Promise<void>; rows: Row[]; withComposer: boolean } = $props();
	const errors = new SvelteMap<string, string>();
	async function stop(id: string) {
		errors.delete(id);
		try {
			await onstoptask?.(id);
		} catch {
			errors.set(id, 'Could not reach this task. Try again.');
		}
	}
	let open = $state(false);
</script>

{#snippet contents(row: Row)}
	<span
		aria-hidden="true"
		class={[
			'size-4 shrink-0 text-muted',
			row.kind === 'Subagent'
				? 'icon-[lucide--git-branch]'
				: row.kind === 'Terminal'
					? 'icon-[lucide--terminal]'
					: toolIcon(row.kind)
		]}
	></span>
	<span
		class={[
			'min-w-0 flex-1 truncate text-left text-sm font-medium',
			row.kind === 'Terminal' && 'font-mono'
		]}>{row.label}</span
	>
	{#if row.label !== row.kind}
		<span class="hidden shrink-0 text-xs text-muted @sm:block">{row.kind}</span>
	{/if}
	{#if row.open}<span
			aria-hidden="true"
			class="icon-[lucide--arrow-up-right] size-3.5 shrink-0 text-muted group-hover:text-ink"
		></span>{/if}
{/snippet}

<div class={['mx-auto w-full max-w-5xl shrink-0 px-5', withComposer ? '-mb-3' : 'pb-3']}>
	<Disclosure
		bind:open
		class="@container mx-1 rounded-card bg-sidebar px-2 pt-1 ring-1 ring-line/60 {withComposer
			? 'pb-4'
			: 'pb-1'}"
		summaryClass="min-h-9 w-full px-2 text-sm hover:bg-hover focus-visible:outline-offset-0"
	>
		{#snippet heading()}
			<span
				class="grid size-6 shrink-0 place-items-center rounded-control bg-accent-soft text-accent-ink"
				><Spinner label="Running" /></span
			>
			<span class="shrink-0 font-semibold">Background tasks</span>
			<span class="rounded-control bg-sunken px-1.5 text-xs font-semibold text-muted tabular-nums"
				>{rows.length}</span
			>
			{#if !open}<span class="ml-1 min-w-0 truncate text-xs text-muted" title={rows[0].label}
					>{rows[0].label}</span
				>{/if}
		{/snippet}
		{#if open}
			<ul class="max-h-40 overflow-y-auto px-2 pb-1">
				{#each rows as row, index (row.task.type + row.task.id)}
					<li class="relative flex items-stretch pt-1 pl-8">
						<!-- Connect the live indicator to its tasks. The final branch ends at the row. -->
						<span
							aria-hidden="true"
							class="absolute top-0 left-3 h-1/2 w-4 rounded-bl-control border-b border-l border-muted/35"
						></span>
						{#if index < rows.length - 1}<span
								aria-hidden="true"
								class="absolute inset-y-0 left-3 border-l border-muted/35"
							></span>{/if}
						{#if row.open}
							<button
								type="button"
								class="group flex min-w-0 flex-1 items-center gap-2.5 rounded-control bg-surface px-3 py-2 text-ink hover:shadow-soft focus-visible:outline-offset-0"
								title={row.label}
								onclick={row.open}
							>
								{@render contents(row)}
							</button>
						{:else}
							<div
								class="flex min-w-0 flex-1 items-center gap-2.5 rounded-control bg-surface px-3 py-2 text-ink"
								title={row.label}
							>
								{@render contents(row)}
							</div>
						{/if}
						{#if row.task.stopId && onstoptask}
							<Button
								variant="ghost"
								size="sm"
								class="ml-1 self-center"
								icon="icon-[lucide--square]"
								label={'Stop ' + row.label}
								busy={row.task.stopping}
								onclick={() => stop(row.task.stopId!)}
							/>
						{/if}
					</li>
					{#if row.task.stopError || errors.get(row.task.stopId ?? '')}
						<li role="alert" class="pl-8 text-xs text-danger">
							{row.task.stopError || errors.get(row.task.stopId ?? '')}
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</Disclosure>
</div>
