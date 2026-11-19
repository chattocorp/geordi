<script lang="ts">
	import type { BackgroundTask } from '@geordi/protocol';
	import { toolIcon } from '@geordi/ui/tools';
	import Button from '@geordi/ui/Button.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Disclosure from '@geordi/ui/Disclosure.svelte';

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
	const rowClass = 'flex min-h-7 min-w-0 flex-1 items-center gap-2 px-2 py-1 text-xs text-ink';
</script>

{#snippet contents(row: Row)}
	<span
		aria-hidden="true"
		class={[
			'size-3.5 shrink-0 text-muted',
			row.kind === 'Subagent'
				? 'icon-[lucide--git-branch]'
				: row.kind === 'Terminal'
					? 'icon-[lucide--terminal]'
					: toolIcon(row.kind)
		]}
	></span>
	<span class={['min-w-0 flex-1 truncate text-left', row.kind === 'Terminal' && 'font-mono']}
		>{row.label}</span
	>
	{#if row.label !== row.kind}
		<span
			class={row.kind === 'Terminal' || row.kind === 'Subagent'
				? 'sr-only'
				: 'hidden shrink-0 text-xs text-muted @sm:block'}>{row.kind}</span
		>
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
		summaryClass="min-h-9 w-full px-2 text-sm focus-visible:outline-offset-0"
	>
		{#snippet heading()}
			<span class="shrink-0 font-semibold">Background tasks</span>
			<span class="rounded-control bg-sunken px-1.5 text-xs font-semibold text-muted tabular-nums"
				>{rows.length}</span
			>
			{#if !open}<span class="ml-1 min-w-0 truncate text-xs text-muted" title={rows[0].label}
					>{rows[0].label}</span
				>{/if}
		{/snippet}
		{#if open}
			<ul class="max-h-40 overflow-y-auto pb-1">
				{#each rows as row (row.task.type + row.task.id)}
					<li class="flex items-center gap-1">
						{#if row.open}
							<button
								type="button"
								class="{rowClass} group rounded-control hover:bg-hover focus-visible:outline-offset-0"
								title={row.label}
								onclick={row.open}
							>
								{@render contents(row)}
							</button>
						{:else}
							<div class={rowClass} title={row.label}>
								{@render contents(row)}
							</div>
						{/if}
						{#if row.task.stopId && onstoptask}
							<Button
								variant="ghost"
								size="sm"
								icon="icon-[lucide--square]"
								label={'Stop ' + row.label}
								busy={row.task.stopping}
								onclick={() => stop(row.task.stopId!)}
							/>
						{/if}
					</li>
					{#if row.task.stopError || errors.get(row.task.stopId ?? '')}
						<li role="alert" class="px-2 text-xs text-danger">
							{row.task.stopError || errors.get(row.task.stopId ?? '')}
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</Disclosure>
</div>
