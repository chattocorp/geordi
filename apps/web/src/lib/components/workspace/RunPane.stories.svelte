<script module lang="ts">
	import { expect, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Task } from '@geordi/protocol';
	import type { JobState } from '@geordi/ui/JobMark.svelte';
	import PaneTabs from '@geordi/ui/PaneTabs.svelte';
	import RunPane from '@geordi/ui/RunPane.svelte';
	import RunTab from '@geordi/ui/RunTab.svelte';
	import Notice from '#lib/ui/Notice.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Run', component: RunPane });
	const task = (name: string, label: string, fields: Partial<Task>): Task => ({
		name,
		label,
		command: null,
		approved: true,
		ports: [],
		links: [],
		needs: [],
		default: false,
		...fields
	});
	// the repository's own tasks (`.geordi.yml`)
	const tasks: Task[] = [
		task('web', 'Web server', {
			command: 'node scripts/workspace-dev.mjs web',
			ports: [
				{ name: 'http', port: 20000 },
				{ name: 'daemon', port: 20001 },
				{ name: 'live', port: 20002 }
			]
		}),
		task('daemon', 'Agent daemon', {
			command: 'node scripts/workspace-dev.mjs daemon',
			needs: ['web']
		}),
		task('app', 'Geordi', {
			links: [{ name: 'app', href: 'http://localhost:20000/' }],
			needs: ['daemon', 'web'],
			default: true
		}),
		task('reset', 'Reset development data', { command: 'node scripts/workspace-dev.mjs reset' }),
		task('storybook', 'Storybook', {
			command: 'node scripts/workspace-dev.mjs storybook',
			ports: [{ name: 'http', port: 20003 }],
			links: [
				{ name: 'stories', label: 'Stories', href: 'http://localhost:20003/' },
				{ name: 'docs', label: 'Docs', href: 'http://localhost:20003/?path=/docs' }
			]
		}),
		task('website', 'Website', {
			command: 'pnpm --filter @geordi/website dev --port $PORT',
			ports: [{ name: 'http', port: 20004 }],
			links: [{ name: 'website', href: 'http://localhost:20004/' }]
		}),
		task('desktop', 'Electron dev app', {
			command: 'pnpm desktop:dev',
			ports: [
				{ name: 'forge', port: 20005 },
				{ name: 'daemon', port: 20006 },
				{ name: 'live', port: 20007 }
			]
		}),
		task('handbook', 'Handbook', {
			links: [{ name: 'handbook', href: 'http://localhost:8080/' }]
		})
	];
	const states: Record<string, JobState> = {
		web: 'running',
		daemon: 'starting',
		reset: { ended: 1 },
		storybook: 'running'
	};
</script>

<script lang="ts">
	let last = $state('No action');
</script>

{#snippet pane(stateOf: (name: string) => JobState, problem: string | null = null, opened = false)}
	<div class="flex h-120 w-96 flex-col sheet-quiet">
		<PaneTabs prefix="run-tasks" tabs={['Terminal 1', 'Tasks']} current="Tasks">
			{#snippet tab(id: string)}
				{#if id === 'Tasks'}
					<RunTab jobs={tasks.filter((task) => task.command)} {stateOf} />
				{:else}
					<span class="icon-[lucide--square-terminal] size-3.5"></span>
					{id}
				{/if}
			{/snippet}
		</PaneTabs>
		<RunPane
			tasks={problem ? [] : tasks}
			shortcut="runDefault"
			{stateOf}
			hasTerminal={(name) => stateOf(name) !== 'stopped'}
			run={(ref) => (last = `Run: ${ref}`)}
			stop={(name) => (last = `Stop: ${name}`)}
			show={(name) => (last = `Show: ${name}`)}
		>
			{#if opened}
				<a class="item" href="#app">Open Geordi in browser</a>
			{/if}
			{#if problem}
				<Notice>The repository's configuration can't be read: {problem}</Notice>
			{/if}
		</RunPane>
	</div>
	<p class="mt-2 text-sm text-muted">{last}</p>
{/snippet}

<Story
	name="Tasks"
	asChild
	play={async ({ canvas, userEvent }) => {
		// what is starting shows on the tab, ahead of what runs
		await expect(
			within(canvas.getByRole('tab', { name: /Tasks/ })).getByRole('img', { name: 'Job starting' })
		).toBeVisible();
		// one list in configuration order, the defaults first, each task's links under it;
		// the row runs a task, the icon beside it shows its terminal once it has one
		const rows = canvas.getAllByRole('button', { name: /^(Open|Run|Show terminal of) / });
		await expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
			// the default first, what the shortcut runs
			'Open Geordi',
			'Run Web server',
			'Show terminal of Web server',
			'Run Agent daemon',
			'Show terminal of Agent daemon',
			'Run Reset development data',
			'Show terminal of Reset development data',
			'Run Storybook',
			'Show terminal of Storybook',
			'Open Stories',
			'Open Docs',
			'Run Website',
			'Open Website',
			'Run Electron dev app',
			'Open Handbook'
		]);
		// pointing at a task shows what it needs, and what that needs in turn
		const row = (name: string) => canvas.getByRole('button', { name }).closest('div')!;
		await userEvent.hover(row('Open Geordi'));
		for (const name of ['Run Agent daemon', 'Run Web server'])
			await expect(row(name)).toHaveClass('bg-surface/60');
		await expect(row('Run Storybook')).not.toHaveClass('bg-surface/60');
		await userEvent.unhover(row('Open Geordi'));
		await expect(row('Run Web server')).not.toHaveClass('bg-surface/60');
		// the default carries the shortcut
		await expect(
			canvas.getByRole('button', { name: 'Open Geordi' }).querySelector('kbd')
		).toBeVisible();
		// all of a task's ports show where one points at it
		await expect(canvas.getByText(':20005 :20006 :20007')).not.toBeVisible();
		canvas.getByRole('button', { name: 'Show terminal of Storybook' }).focus();
		await userEvent.tab(); // to Stop Storybook
		await userEvent.tab(); // Stories
		await userEvent.tab(); // Docs
		await userEvent.tab(); // Website
		await userEvent.tab(); // its only link, at the end of its row
		await userEvent.tab();
		const desktop = canvas.getByRole('button', { name: 'Run Electron dev app' });
		await expect(desktop).toHaveFocus();
		await expect(canvas.getByText(':20005 :20006 :20007')).toBeVisible();
		// what is not running is quiet, and says the row runs it where one points at it
		await expect(desktop.querySelector('[class~="icon-[lucide--play]"]')).toBeVisible();
		await expect(within(desktop).getByTitle('Not running')).not.toBeVisible();
		const website = canvas.getByRole('button', { name: 'Run Website' });
		await expect(within(website).getByTitle('Not running')).toBeVisible();
		await expect(website.querySelector('[class~="icon-[lucide--play]"]')).not.toBeVisible();
		// a link opens, running its task; one of several by name
		await userEvent.click(canvas.getByRole('button', { name: 'Open Docs' }));
		await expect(canvas.getByText('Run: storybook.docs')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Open Website' }));
		await expect(canvas.getByText('Run: website.website')).toBeVisible();
		// the row runs, also one that ran before; the icon beside it shows its output
		await userEvent.click(canvas.getByRole('button', { name: 'Run Web server' }));
		await expect(canvas.getByText('Run: web')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Show terminal of Web server' }));
		await expect(canvas.getByText('Show: web')).toBeVisible();
		await expect(canvas.getByTitle('Ended with status 1')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Run Reset development data' }));
		await expect(canvas.getByText('Run: reset')).toBeVisible();
		// a task that never ran has no output to show
		await expect(
			canvas.queryByRole('button', { name: 'Show terminal of Electron dev app' })
		).toBeNull();
		// a link that needs nothing just opens
		await userEvent.click(canvas.getByRole('button', { name: 'Open Handbook' }));
		await expect(canvas.getByText('Run: handbook')).toBeVisible();
		// what runs can be stopped; what is stopped has nothing to stop
		await userEvent.click(canvas.getByRole('button', { name: 'Stop Agent daemon' }));
		await expect(canvas.getByText('Stop: daemon')).toBeVisible();
		await expect(canvas.queryByRole('button', { name: 'Stop Website' })).toBeNull();
	}}
>
	{@render pane((name) => states[name] ?? 'stopped')}
</Story>
<Story name="Nothing running" asChild>{@render pane(() => 'stopped')}</Story>
<Story
	name="Everything running"
	asChild
	play={async ({ canvas }) => {
		// what listens is ready to look at; what has no ports turns, at work
		const web = canvas.getByRole('button', { name: 'Run Web server' });
		await expect(web.querySelector('[class~="icon-[lucide--play]"]')).toBeVisible();
		const daemon = canvas.getByRole('button', { name: 'Run Agent daemon' });
		await expect(daemon.querySelector('[class~="icon-[lucide--refresh-cw]"]')).toBeVisible();
		await expect(daemon.querySelector('[class~="icon-[lucide--play]"]')).toBeNull();
	}}
>
	{@render pane(() => 'running', null, true)}
</Story>
<Story name="Unreadable configuration" asChild>
	{@render pane(
		() => 'stopped',
		'`run`, `jobs` are no longer read: say what to run under `tasks`, each with the ports it listens on'
	)}
</Story>
