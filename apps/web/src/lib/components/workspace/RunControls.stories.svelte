<script module lang="ts">
	import { expect, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Job, Link, RepoConfig } from '@geordi/protocol';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import RunControls from './RunControls.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Run', component: RunControls });
	const web: Job = {
		name: 'web',
		label: 'Development server',
		command: 'pnpm dev',
		needs: [],
		port: 20000,
		approved: true
	};
	const app: Link = {
		name: 'app',
		label: 'Geordi dev app',
		href: 'http://localhost:20000/',
		needs: ['web']
	};
</script>

<script lang="ts">
	let last = $state('No action');
</script>

{#snippet controls(
	jobs: Job[],
	links: Link[],
	running = false,
	booting: string[] = [],
	defaultTarget?: RepoConfig['default']
)}
	<div class="flex items-center gap-2">
		<RunControls
			{jobs}
			{defaultTarget}
			{links}
			isUp={() => running}
			launching={new Set(booting)}
			start={(names) => (last = `Start: ${names.join(', ')}`)}
			stop={(name) => (last = `Stop: ${name}`)}
			visit={(link) => (last = `Open: ${link.name}`)}
		/>
		<ContextMenu />
	</div>
	<p class="text-sm text-muted">{last}</p>
{/snippet}

<Story
	name="Named jobs and links"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Let the test viewport settle: resizing deliberately closes an open menu.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
		await userEvent.click(canvas.getByRole('button', { name: 'Run' }));
		await expect(canvas.queryByRole('menu')).toBeNull();
		await expect(canvas.getByText('Start: web')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Run menu' }));
		await userEvent.click(
			await canvas.findByRole('menuitem', { name: 'Start Development server' })
		);
		await expect(canvas.getByText('Start: web')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Run menu' }));
		await userEvent.click(await canvas.findByRole('menuitem', { name: 'Geordi dev app' }));
		await expect(canvas.getByText('Open: app')).toBeVisible();
	}}
	>{@render controls(
		[web, { ...web, name: 'daemon', label: 'Agent daemon' }],
		[app],
		false,
		[],
		'jobs.web'
	)}</Story
>
<Story name="Key fallback" asChild
	>{@render controls([{ ...web, label: undefined }], [{ ...app, label: undefined }])}</Story
>
<Story name="Booting" asChild>{@render controls([web], [app], true, ['web'])}</Story>
<Story name="Booting one job" asChild>{@render controls([web], [], true, ['web'])}</Story>
<Story name="Only links" asChild>{@render controls([], [app])}</Story>
<Story name="One named job" asChild>{@render controls([web], [])}</Story>
<Story name="Stop a named job" asChild>{@render controls([web], [], true)}</Story>
<Story name="Run shorthand" asChild
	>{@render controls([{ ...web, name: 'run', label: undefined }], [])}</Story
>
<Story
	name="Default URL"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Run' }));
		await expect(canvas.getByText('Open: app')).toBeVisible();
		await expect(canvas.queryByRole('menu')).toBeNull();
	}}>{@render controls([web], [{ ...app, name: 'docs' }, app], false, [], 'urls.app')}</Story
>
