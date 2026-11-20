<script module lang="ts">
	import { expect, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Job, Link } from '@geordi/protocol';
	import type { JobState } from './JobMark.svelte';
	import RunPane from './RunPane.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Run', component: RunPane });
	const job = (name: string, label: string, command: string, port: number): Job => ({
		name,
		label,
		command,
		needs: [],
		port,
		approved: true
	});
	const web = job('web', 'Static server', 'node serve.js', 20000);
	const jobs = [
		web,
		job(
			'preview',
			'Preview server that takes a few seconds to come up',
			'SERVE_DELAY=5 node serve.js',
			20001
		),
		job('check', 'Check links', 'node check.js', 20002),
		job('test', 'Tests', 'node --test', 20003),
		job('docs', 'Documentation', 'pnpm docs --port $PORT', 20004)
	];
	const links: Link[] = [
		{ name: 'site', label: 'Site', href: 'http://localhost:20000/', needs: ['web'] },
		{
			name: 'about',
			label: 'About page',
			href: 'http://localhost:20001/about.html',
			needs: ['preview']
		}
	];
	const states: Record<string, JobState> = {
		web: 'running',
		preview: 'starting',
		check: { ended: 1 },
		test: { ended: 0 },
		docs: 'stopped'
	};
</script>

<script lang="ts">
	let last = $state('No action');
</script>

{#snippet pane(
	jobs: Job[],
	links: Link[],
	stateOf: (name: string) => JobState,
	problem: string | null = null
)}
	<div class="flex h-120 w-96 flex-col sheet-quiet">
		<RunPane
			{jobs}
			{links}
			{stateOf}
			{problem}
			start={(names) => (last = `Start: ${names.join(', ')}`)}
			stop={(name) => (last = `Stop: ${name}`)}
			show={(name) => (last = `Show: ${name}`)}
			visit={(link) => (last = `Open: ${link.name}`)}
		/>
	</div>
	<p class="mt-2 text-sm text-muted">{last}</p>
{/snippet}

<Story
	name="Every state"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('localhost:20000')).not.toBeVisible();
		await expect(canvas.getByText(':20000')).not.toBeVisible();
		await userEvent.tab();
		await expect(canvas.getByText('localhost:20000')).toBeVisible();
		await userEvent.click(canvas.getByTitle('Show the output of Static server'));
		await expect(canvas.getByText('Show: web')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Stop Static server' }));
		await expect(canvas.getByText('Stop: web')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Start Documentation' }));
		await expect(canvas.getByText('Start: docs')).toBeVisible();
		// what is not running yet starts at once; what runs stops at once
		await userEvent.click(canvas.getByRole('button', { name: 'Start all' }));
		await expect(canvas.getByText('Start: check, test, docs')).toBeVisible();
		await expect(canvas.getByTitle('Ended with status 1')).toBeVisible();
		// a job that never ran has no output to show
		await expect(canvas.queryByTitle('Show the output of Documentation')).toBeNull();
		await userEvent.click(canvas.getByTitle('Open http://localhost:20000/'));
		await expect(canvas.getByText('Open: site')).toBeVisible();
	}}>{@render pane(jobs, links, (name) => states[name] ?? 'stopped')}</Story
>
<Story name="Nothing running" asChild>{@render pane(jobs, links, () => 'stopped')}</Story>
<Story name="Only links" asChild>{@render pane([], links, () => 'stopped')}</Story>
<Story name="Unreadable configuration" asChild
	>{@render pane([], [], () => 'stopped', 'jobs.web: command is missing')}</Story
>
