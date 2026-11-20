<script module lang="ts">
	import { expect, fireEvent, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Job, Link, RepoConfig } from '@geordi/protocol';
	import type { JobState } from './JobMark.svelte';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import DockMenus from './DockMenus.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Dock menus', component: DockMenus });
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

{#snippet menus(jobs: Job[], links: Link[], target?: RepoConfig['default'])}
	<div class="pane-bar justify-end sheet-quiet px-2">
		<DockMenus
			{target}
			show={(name) => (last = `Showed ${name}`)}
			{jobs}
			{links}
			stateOf={(name) => states[name]}
			start={(names) => (last = `Started ${names.join(', ')}`)}
			stop={(name) => (last = `Stopped ${name}`)}
			visit={(link) => (last = `Opened ${link.name}`)}
		/>
	</div>
	<ContextMenu />
	<p>{last}</p>
{/snippet}

<Story
	name="Dock actions"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Open Site' }));

		await expect(canvas.getByText('Opened site')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Open and start menu' }));
		await expect(
			canvas
				.getAllByRole('menuitem')
				.slice(0, 2)
				.map((item) => item.textContent?.trim())
		).toEqual(['Site', 'About page']);
		await expect(canvas.getByRole('menuitem', { name: 'Static server' })).toBeDisabled();
		await fireEvent.click(canvas.getByRole('menuitem', { name: 'Documentation' }));
		await expect(canvas.getByText('Started docs')).toBeVisible();
	}}>{@render menus(jobs, links)}</Story
>
<Story name="Only links" asChild>{@render menus([], links)}</Story>
<Story name="Only jobs" asChild>{@render menus(jobs, [])}</Story>

<Story
	name="Configured default job"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('button', { name: 'Start Documentation' })).toBeVisible();
		const mac = /Mac|iPhone|iPad/.test(navigator.platform);
		await fireEvent.keyDown(window, {
			key: 'Enter',
			code: 'Enter',
			altKey: true,
			metaKey: mac,
			ctrlKey: !mac
		});
		await expect(canvas.getByText('Started docs')).toBeVisible();
	}}>{@render menus(jobs, links, 'jobs.docs')}</Story
>
