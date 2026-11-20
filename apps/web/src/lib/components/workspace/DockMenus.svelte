<script lang="ts">
	import { defaultAction, type Job, type Link, type RepoConfig } from '@geordi/protocol';
	import { hint, pressed } from '@geordi/ui/keys';
	import ButtonGroup from '@geordi/ui/ButtonGroup.svelte';
	import { openMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
	import type { JobState } from './JobMark.svelte';

	let {
		target,
		show,
		jobs,
		links,
		stateOf,
		start,
		stop,
		visit
	}: {
		target?: RepoConfig['default'];
		show: (name: string) => void;
		jobs: Job[];
		links: Link[];
		stateOf: (name: string) => JobState;
		start: (names: string[]) => void;
		stop: (name: string) => void;
		visit: (link: Link) => void;
	} = $props();

	const primary = $derived.by(() => {
		const key = defaultAction({ default: target, urls: links, jobs })?.default;
		const link = links.find((item) => `urls.${item.name}` === key);
		if (link)
			return {
				label: `Open ${link.label ?? link.name}`,
				icon: 'icon-[lucide--external-link]',
				run: () => visit(link)
			};
		const job = jobs.find((item) => `jobs.${item.name}` === key);
		if (!job) return;
		const name = job.label ?? job.name;
		const state = stateOf(job.name);
		if (state === 'running' || state === 'starting')
			return {
				label: `Show ${name} terminal`,
				icon: 'icon-[lucide--square-terminal]',
				run: () => show(job.name)
			};
		return { label: `Start ${name}`, icon: 'icon-[lucide--play]', run: () => start([job.name]) };
	});

	function menu(): MenuItem[] {
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
		const opens: MenuItem[] = links.map((link) => ({
			label: link.label ?? link.name,
			icon: 'icon-[lucide--external-link]',
			onselect: () => visit(link)
		}));
		if (opens.length && items.length) opens.push('separator');
		return [...opens, ...items];
	}
</script>

<svelte:window
	onkeydowncapture={(event) => {
		if (
			!primary ||
			!pressed(event, 'runDefault') ||
			event.defaultPrevented ||
			document.querySelector('dialog:modal, :popover-open')
		)
			return;
		event.preventDefault();
		event.stopPropagation();
		if (!event.repeat) primary.run();
	}}
/>

{#if primary}
	<ButtonGroup label="Workspace actions">
		<button
			type="button"
			class="item h-7 max-w-40 gap-1.5 px-2 text-xs text-muted hover:bg-hover hover:text-ink"
			title="{primary.label} ({hint('runDefault')})"
			onclick={primary.run}
		>
			<span class={[primary.icon, 'size-3.5 shrink-0']}></span><span class="truncate"
				>{primary.label}</span
			>
		</button>
		{#if jobs.length + links.length > 1}
			<button
				type="button"
				class="item h-7 px-1.5 text-muted hover:bg-hover hover:text-ink"
				aria-label="Open and start menu"
				title="Open and start menu"
				aria-haspopup="menu"
				onclick={(event) => openMenu(event.currentTarget, menu())}
				><span class="icon-[lucide--chevron-down] size-3.5"></span></button
			>
		{/if}
	</ButtonGroup>
{/if}
