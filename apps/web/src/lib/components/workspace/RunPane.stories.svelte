<script module lang="ts">
	import { expect, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Job, Link, RepoConfig } from '@geordi/protocol';
	import type { JobState } from '@geordi/ui/JobMark.svelte';
	import PaneTabs from '@geordi/ui/PaneTabs.svelte';
	import RunPane from '@geordi/ui/RunPane.svelte';
	import RunTab from '@geordi/ui/RunTab.svelte';
	import Notice from '#lib/ui/Notice.svelte';

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
	// the repository's own tasks (`.geordi.yml`)
	const tasks: NonNullable<RepoConfig['tasks']> = [
		{ name: 'web', label: 'Web server', needs: [], default: false },
		{ name: 'daemon', label: 'Agent daemon', needs: ['web'], default: false },
		{ name: 'app', label: 'Geordi', needs: ['daemon'], default: true },
		{ name: 'reset', label: 'Reset development data', needs: [], default: false },
		{ name: 'storybook', label: 'Storybook', needs: [], default: false },
		{ name: 'desktop', label: 'Electron dev app', needs: [], default: false }
	];
	const taskJobs = [
		job('web', 'Web server', 'node scripts/workspace-dev.mjs web', 20000),
		job('daemon', 'Agent daemon', 'node scripts/workspace-dev.mjs daemon', 20001),
		job('reset', 'Reset development data', 'node scripts/workspace-dev.mjs reset', 20002),
		job('storybook', 'Storybook', 'node scripts/workspace-dev.mjs storybook', 20003),
		job('desktop', 'Electron dev app', 'pnpm desktop:dev', 20004)
	];
	const taskLinks: Link[] = [
		{ name: 'app', label: 'Geordi', href: 'http://localhost:20000/', needs: ['daemon'] },
		{ name: 'storybook', label: 'Storybook', href: 'http://localhost:20003/', needs: [] }
	];
	const taskStates: Record<string, JobState> = {
		web: 'running',
		daemon: 'starting',
		reset: { ended: 1 },
		storybook: 'running'
	};
</script>

<script lang="ts">
	let last = $state('No action');
</script>

{#snippet pane(
	jobs: Job[],
	links: Link[],
	stateOf: (name: string) => JobState,
	problem: string | null = null,
	defaultAction?: RepoConfig['default']
)}
	<div class="flex h-120 w-96 flex-col sheet-quiet">
		{#if defaultAction}
			<PaneTabs prefix="run-dock" tabs={['Terminal 1', 'Tasks']} current="Tasks">
				{#snippet tab(id: string)}
					{#if id === 'Tasks'}
						<RunTab {jobs} {stateOf} />
					{:else}
						<span class="icon-[lucide--square-terminal] size-3.5"></span>
						{id}
					{/if}
				{/snippet}
			</PaneTabs>
		{/if}
		<RunPane
			{defaultAction}
			shortcut="runDefault"
			{jobs}
			{links}
			{stateOf}
			hasTerminal={(name) => stateOf(name) !== 'stopped' && name !== 'preview'}
			start={(names) => (last = `Start: ${names.join(', ')}`)}
			stop={(name) => (last = `Stop: ${name}`)}
			show={(name) => (last = `Show: ${name}`)}
			visit={(link) => (last = `Open: ${link.name}`)}
		>
			{#if problem}
				<Notice>The repository's configuration can't be read: {problem}</Notice>
			{/if}
		</RunPane>
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
		const startDocs = canvas.getByRole('button', { name: 'Start Documentation' });
		await expect(startDocs.querySelector('[class~="icon-[lucide--play]"]')).toBeVisible();
		await userEvent.tab();
		await expect(canvas.getByText('localhost:20000')).toBeVisible();
		const terminal = canvas.getByRole('button', { name: 'Open terminal for Static server' });
		await userEvent.click(terminal.querySelector('[class~="icon-[lucide--square-terminal]"]')!);
		await expect(canvas.getByText('Show: web')).toBeVisible();
		const stopWeb = canvas.getByRole('button', { name: 'Stop Static server' });
		await expect(stopWeb.querySelector('.text-danger')).not.toBeVisible();
		await userEvent.tab({ shift: true });
		await expect(stopWeb).toHaveFocus();
		await expect(stopWeb.querySelector('.text-danger')).toBeVisible();
		await userEvent.click(stopWeb);
		await expect(canvas.getByText('Stop: web')).toBeVisible();
		await userEvent.click(startDocs);
		await expect(canvas.getByText('Start: docs')).toBeVisible();
		// what is not running yet starts at once; what runs stops at once
		await userEvent.click(canvas.getByRole('button', { name: 'Start all' }));
		await expect(canvas.getByText('Start: check, test, docs')).toBeVisible();
		await expect(canvas.getByTitle('Ended with status 1')).toBeVisible();
		// a job that never ran has no output to show
		await expect(
			canvas.queryByRole('button', { name: 'Open terminal for Documentation' })
		).toBeNull();
		await expect(canvas.queryByRole('button', { name: /Open terminal for Preview/ })).toBeNull();
		await userEvent.click(canvas.getByRole('button', { name: 'Open terminal for Check links' }));
		await expect(canvas.getByText('Show: check')).toBeVisible();
		await userEvent.click(canvas.getByTitle('Open http://localhost:20000/'));
		await expect(canvas.getByText('Open: site')).toBeVisible();
	}}>{@render pane(jobs, links, (name) => states[name] ?? 'stopped')}</Story
>
<Story name="Nothing running" asChild>{@render pane(jobs, links, () => 'stopped')}</Story>
<Story name="Only links" asChild>{@render pane([], links, () => 'stopped')}</Story>
<Story name="Unreadable configuration" asChild
	>{@render pane([], [], () => 'stopped', 'jobs.web: command is missing')}</Story
>

<Story
	name="Default link"
	asChild
	play={async ({ canvas, userEvent }) => {
		await expect(
			within(canvas.getByRole('tab', { name: /Tasks/ })).getByRole('img', { name: 'Job running' })
		).toBeVisible();
		const first = within(canvas.getByRole('region', { name: 'Default action' })).getByRole(
			'button',
			{ name: /Open About page/ }
		);
		await expect(canvas.getAllByRole('button')[0]).toBe(first);
		await userEvent.click(first);
		await expect(canvas.getByText('Open: about')).toBeVisible();
		await expect(
			within(canvas.getByRole('region', { name: 'Open' })).queryByText('About page')
		).toBeNull();
	}}
>
	{@render pane(
		[web, jobs[1], jobs[3]],
		links,
		(name) => (name === 'preview' ? 'running' : 'stopped'),
		null,
		'urls.about'
	)}
</Story>
<Story
	name="Default job"
	asChild
	play={async ({ canvas, userEvent }) => {
		const first = canvas.getAllByRole('button')[0];
		await expect(first).toHaveAccessibleName(/Stop Static server/);
		await userEvent.click(first);
		await expect(canvas.getByText('Stop: web')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Open terminal for Static server' }));
		await expect(canvas.getByText('Show: web')).toBeVisible();
	}}
>
	{@render pane(jobs, links, (name) => states[name], null, 'jobs.web')}
</Story>

{#snippet unified(stateOf: (name: string) => JobState, opened = false)}
	<div class="flex h-120 w-96 flex-col sheet-quiet">
		<PaneTabs prefix="run-tasks" tabs={['Tasks']} current="Tasks">
			{#snippet tab(id: string)}
				{#if id === 'Tasks'}
					<RunTab jobs={taskJobs} {stateOf} />
				{:else}
					<span class="icon-[lucide--square-terminal] size-3.5"></span>
					{id}
				{/if}
			{/snippet}
		</PaneTabs>
		<RunPane
			{tasks}
			jobs={taskJobs}
			links={taskLinks}
			{stateOf}
			hasTerminal={(name) => stateOf(name) !== 'stopped'}
			shortcut="runDefault"
			launch={(names) => (last = `Run: ${names.join(', ')}`)}
			start={() => {}}
			stop={(name) => (last = `Stop: ${name}`)}
			show={(name) => (last = `Show: ${name}`)}
			visit={() => {}}
		>
			{#if opened}
				<a class="item" href="#app">Open Geordi in browser</a>
			{/if}
		</RunPane>
	</div>
	<p class="mt-2 text-sm text-muted">{last}</p>
{/snippet}

<Story
	name="Tasks"
	asChild
	play={async ({ canvas, userEvent }) => {
		// one list in configuration order; the default carries the shortcut
		const rows = canvas.getAllByRole('button', { name: /^(Open|Run|Open terminal for) / });
		await expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
			'Open terminal for Web server',
			'Open terminal for Agent daemon',
			'Open Geordi',
			'Run Reset development data',
			'Open terminal for Reset development data',
			'Open Storybook',
			'Open terminal for Storybook',
			'Run Electron dev app'
		]);
		await expect(
			canvas.getByRole('button', { name: 'Open Geordi' }).querySelector('kbd')
		).toBeVisible();
		await expect(
			canvas.getAllByRole('button', { name: /^Open|^Run/ }).filter((b) => b.querySelector('kbd'))
		).toHaveLength(1);
		// a URL opens, starting what it needs
		await userEvent.click(canvas.getByRole('button', { name: 'Open Storybook' }));
		await expect(canvas.getByText('Run: storybook')).toBeVisible();
		// a command that ran shows its output; one that never ran runs
		await userEvent.click(canvas.getByRole('button', { name: 'Open terminal for Web server' }));
		await expect(canvas.getByText('Show: web')).toBeVisible();
		// a passive mark is part of its row: its glyph does what the label does
		const desktop = canvas.getByRole('button', { name: 'Run Electron dev app' });
		await userEvent.click(desktop.querySelector('[class~="icon-[lucide--play]"]')!);
		await expect(canvas.getByText('Run: desktop')).toBeVisible();
		await userEvent.click(canvas.getByText('Storybook'));
		// (Geordi waits for the daemon, which is starting)
		await userEvent.click(canvas.getByRole('button', { name: 'Open Geordi' }).firstElementChild!);
		await expect(canvas.getByText('Run: app')).toBeVisible();
		// one tab stop per action: an idle command is its row alone
		canvas.getByRole('button', { name: 'Open terminal for Storybook' }).focus();
		await userEvent.tab();
		await expect(canvas.getByRole('button', { name: 'Run Electron dev app' })).toHaveFocus();
		// a command that ended can run again from its mark
		await userEvent.click(canvas.getByRole('button', { name: 'Run Reset development data' }));
		await expect(canvas.getByText('Run: reset')).toBeVisible();
		// the mark of what runs stops it
		await userEvent.click(canvas.getByRole('button', { name: 'Stop Agent daemon' }));
		await expect(canvas.getByText('Stop: daemon')).toBeVisible();
		await expect(canvas.getByTitle('Ended with status 1')).toBeVisible();
	}}>{@render unified((name) => taskStates[name] ?? 'stopped')}</Story
>
<Story name="Tasks, nothing running" asChild>{@render unified(() => 'stopped')}</Story>
<Story name="Tasks, link blocked" asChild
	>{@render unified((name) => (name === 'storybook' ? 'stopped' : 'running'), true)}</Story
>
