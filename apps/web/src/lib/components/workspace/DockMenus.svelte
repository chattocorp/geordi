<script lang="ts">
	import type { Job, Link } from '@geordi/protocol';
	import { openMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
	import type { JobState } from './JobMark.svelte';

	let {
		jobs,
		links,
		stateOf,
		start,
		stop,
		visit
	}: {
		jobs: Job[];
		links: Link[];
		stateOf: (name: string) => JobState;
		start: (names: string[]) => void;
		stop: (name: string) => void;
		visit: (link: Link) => void;
	} = $props();

	function jobMenu(): MenuItem[] {
		const idle: string[] = [];
		const active: string[] = [];
		const items: MenuItem[] = jobs.map((job) => {
			const state = stateOf(job.name);
			const running = state === 'running' || state === 'starting';
			(running ? active : idle).push(job.name);
			return {
				label: job.label ?? job.name,
				icon: running ? 'icon-[lucide--circle-dot]' : 'icon-[lucide--play]',
				disabled: running,
				onselect: () => start([job.name])
			};
		});
		if (jobs.length > 1 && idle.length)
			items.push('separator', { label: 'Start all', onselect: () => start(idle) });
		if (active.length > 1) items.push({ label: 'Stop all', onselect: () => active.forEach(stop) });
		return items;
	}
</script>

{#snippet caret()}<span class="icon-[lucide--chevron-down] size-3"></span>{/snippet}
{#if links.length}
	<button
		type="button"
		class="item h-7 gap-1 px-2 text-xs text-muted hover:bg-hover hover:text-ink"
		aria-haspopup="menu"
		onclick={(event) =>
			openMenu(
				event.currentTarget,
				links.map((link) => ({
					label: link.label ?? link.name,
					icon: 'icon-[lucide--external-link]',
					onselect: () => visit(link)
				}))
			)}>Open {@render caret()}</button
	>
{/if}
{#if jobs.length}
	<button
		type="button"
		class="item h-7 gap-1 px-2 text-xs text-muted hover:bg-hover hover:text-ink"
		aria-haspopup="menu"
		onclick={(event) => openMenu(event.currentTarget, jobMenu())}>Start {@render caret()}</button
	>
{/if}
