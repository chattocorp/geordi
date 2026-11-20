<script lang="ts">
	import { dependentsOf, startOrder, type Job, type Link } from '@geordi/protocol';
	import RunPane from '@geordi/ui/RunPane.svelte';

	let { jobs, links }: { jobs: Job[]; links: Link[] } = $props();
	let running = $state<string[]>([]);
	let detail = $state('');

	function start(names: string[]) {
		running = startOrder(jobs, [...running, ...names]);
		detail = '';
	}

	function stop(name: string) {
		const stopped = [name, ...dependentsOf(jobs, name)];
		running = running.filter((job) => !stopped.includes(job));
		detail = '';
	}
</script>

<figure class="rounded-control bg-sunken p-2">
	<figcaption class="px-2 py-1 label">Run pane preview</figcaption>
	<RunPane
		{jobs}
		{links}
		stateOf={(name) => (running.includes(name) ? 'running' : 'stopped')}
		{start}
		{stop}
		show={(name) => {
			detail = jobs.find((job) => job.name === name)?.command ?? '';
		}}
		visit={(link) => {
			start(link.needs);
			detail = link.href;
		}}
	/>
	{#if detail}<output class="block px-2 py-1 code-dense">{detail}</output>{/if}
</figure>
