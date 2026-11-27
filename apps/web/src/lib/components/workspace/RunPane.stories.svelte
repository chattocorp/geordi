<script module lang="ts">
	import { expect, fireEvent, waitFor, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Task } from '@geordi/protocol';
	import type { JobState } from '@geordi/ui/JobMark.svelte';
	import PaneTabs from '@geordi/ui/PaneTabs.svelte';
	import RunPane from '@geordi/ui/RunPane.svelte';
	import RunTools from '@geordi/ui/RunTools.svelte';
	import RunTab from '@geordi/ui/RunTab.svelte';
	import Notice from '#lib/ui/Notice.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Run', component: RunPane });
	const task = (name: string, label: string, fields: Partial<Task>): Task => ({
		name,
		label,
		command: null,
		approved: true,
		ports: [],
		href: null,
		needs: [],
		default: false,
		...fields
	});
	// the repository's own tasks (`.geordi.yml`)
	const tasks: Task[] = [
		task('web', 'Web server', {
			command: 'node scripts/workspace-dev.mjs web',
			ports: [
				{ name: 'web', port: 20000 },
				{ name: 'daemon', port: 20001 },
				{ name: 'live', port: 20002 }
			]
		}),
		task('daemon', 'Agent daemon', {
			command: 'node scripts/workspace-dev.mjs daemon',
			needs: ['web']
		}),
		task('app', 'Geordi', {
			href: 'http://localhost:20000/',
			needs: ['daemon', 'web'],
			default: true
		}),
		task('reset', 'Reset development data', { command: 'node scripts/workspace-dev.mjs reset' }),
		task('storybook', 'Storybook', {
			command: 'node scripts/workspace-dev.mjs storybook',
			ports: [{ name: 'storybook', port: 20003 }],
			href: 'http://localhost:20003/'
		}),
		// another place to look: a task of its own, which needs the one whose port it uses
		task('storybook-docs', 'Storybook docs', {
			href: 'http://localhost:20003/?path=/docs',
			needs: ['storybook']
		}),
		task('website', 'Website', {
			command: 'pnpm --filter @geordi/website dev --port $PORT',
			ports: [{ name: 'website', port: 20004 }],
			href: 'http://localhost:20004/'
		}),
		task('desktop', 'Electron dev app', {
			command: 'pnpm desktop:dev',
			ports: [
				{ name: 'desktop', port: 20005 },
				{ name: 'desktop-daemon', port: 20006 },
				{ name: 'desktop-live', port: 20007 }
			]
		}),
		task('handbook', 'Handbook', {
			href: 'http://localhost:8080/'
		})
	];
	// tasks whose labels begin alike are a group of their own
	const grouped: Task[] = [
		task('play', 'Play', { command: 'pnpm play', default: true, needs: ['act2'] }),
		task('ring1', 'Sorties / Ring 1', { command: 'pnpm play --ring 1' }),
		task('ring2', 'Sorties / Ring 2', { command: 'pnpm play --ring 2' }),
		task('shipyard', 'Shipyard', { command: 'pnpm play --shipyard' }),
		task('ring3', 'Sorties / Ring 3', { command: 'pnpm play --ring 3' }),
		task('act1', 'Finales / Act 1: the camp', { command: 'pnpm play --act 1' }),
		task('act2', 'Finales / Act 2: the duel', { command: 'pnpm play --act 2' })
	];
	const groupStates: Record<string, JobState> = { act2: 'running' };
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

{#snippet pane(
	stateOf: (name: string) => JobState,
	problem: string | null = null,
	opened = false,
	loading = false
)}
	<div class="flex h-120 w-96 flex-col sheet-quiet">
		<PaneTabs prefix="run-tasks" tabs={['Terminal 1', 'Tasks']} current="Tasks">
			{#snippet tab(id: string)}
				{#if id === 'Tasks'}
					<RunTab tasks={tasks.filter((task) => task.command)} {stateOf} />
				{:else}
					<span class="icon-[lucide--square-terminal] size-3.5"></span>
					{id}
				{/if}
			{/snippet}
			{#snippet tabTools(id: string)}
				{#if id === 'Tasks'}
					<RunTools
						{tasks}
						shortcut="runDefault"
						{stateOf}
						runDefault={() => (last = 'Run default')}
						stop={(name) => (last = `Stop: ${name}`)}
					/>
				{/if}
			{/snippet}
		</PaneTabs>
		<RunPane
			tasks={problem || loading ? [] : tasks}
			{loading}
			{stateOf}
			hasTerminal={(name) => stateOf(name) !== 'stopped'}
			run={(ref, showTerminal) => (last = `${showTerminal ? 'Run and show' : 'Run'}: ${ref}`)}
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
		// in the tab, running the default tasks and stopping what runs; then one list in
		// configuration order, the defaults first; at rest, a row is its mark, its name and its URL,
		// and for what runs or ran, its terminal and stopping it
		const rows = canvas.getAllByRole('button', { name: /^(Open|Run|Show terminal of|Stop) / });
		await expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
			'Run Geordi',
			'Stop all',
			// the default first, what the shortcut runs
			'Open Geordi',
			'Run Web server',
			'Show terminal of Web server',
			'Stop Web server',
			'Run Agent daemon',
			'Show terminal of Agent daemon',
			'Stop Agent daemon',
			'Run Reset development data',
			'Show terminal of Reset development data',
			'Run Storybook',
			'Open Storybook',
			'Show terminal of Storybook',
			'Stop Storybook',
			'Open Storybook docs',
			'Run Website',
			'Open Website',
			'Run Electron dev app',
			'Open Handbook'
		]);
		// pointing at a task shows what it needs, and what that needs in turn
		const row = (name: string) => canvas.getByRole('button', { name }).closest('div')!;
		await expect(within(row('Run Web server')).getByRole('img', { name: 'Running' })).toBeVisible();
		await expect(
			within(row('Run Agent daemon')).getByRole('img', { name: 'Starting' })
		).toBeVisible();
		await userEvent.hover(row('Open Geordi'));
		for (const name of ['Run Agent daemon', 'Run Web server'])
			await expect(row(name)).toHaveClass('bg-hover');
		await expect(row('Run Storybook')).not.toHaveClass('bg-hover');
		await userEvent.unhover(row('Open Geordi'));
		await expect(row('Run Web server')).not.toHaveClass('bg-hover');
		// running the defaults names the shortcut
		const runDefault = canvas.getByRole('button', { name: 'Run Geordi' });
		await expect(runDefault.title).toMatch(/^Run Geordi \(.+R\)$/);
		await userEvent.click(runDefault);
		await expect(canvas.getByText('Run default')).toBeVisible();
		// stopping all stops each task that runs (or starts), the last one last
		await userEvent.click(canvas.getByRole('button', { name: 'Stop all' }));
		await expect(canvas.getByText('Stop: storybook')).toBeVisible();
		// the ports of what runs show; those of the rest where one points at it
		await expect(canvas.getByText(':20000 :20001 :20002')).toBeVisible();
		await expect(canvas.getByText(':20005 :20006 :20007')).not.toBeVisible();
		// a task that runs or ran shows what can be done with it, by pointer or keyboard too
		// right after its name and its URL
		canvas.getByRole('button', { name: 'Run Storybook' }).focus();
		await userEvent.tab(); // its URL
		await userEvent.tab(); // to its terminal
		await expect(canvas.getByRole('button', { name: 'Show terminal of Storybook' })).toHaveFocus();
		await userEvent.tab(); // to Stop Storybook
		await userEvent.tab(); // Storybook docs
		await userEvent.tab(); // Website
		await userEvent.tab(); // its URL
		await userEvent.tab();
		const desktop = canvas.getByRole('button', { name: 'Run Electron dev app' });
		await expect(desktop).toHaveFocus();
		await expect(canvas.getByText(':20005 :20006 :20007')).toBeVisible();
		// what is not running is quiet, and says the row runs it where one points at it
		await expect(
			row('Run Electron dev app').querySelector('[class~="icon-[lucide--play]"]')
		).toBeVisible();
		await expect(within(row('Run Electron dev app')).getByTitle('Not running')).not.toBeVisible();
		const website = row('Run Website');
		await expect(within(website).getByTitle('Not running')).toBeVisible();
		await expect(website.querySelector('[class~="icon-[lucide--play]"]')).not.toBeVisible();
		// a URL opens, running its task; one of a task's own, running what it needs
		await userEvent.click(canvas.getByRole('button', { name: 'Open Storybook docs' }));
		await expect(canvas.getByText('Run: storybook-docs')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Open Website' }));
		await expect(canvas.getByText('Run: website')).toBeVisible();
		// the row runs, also one that ran before; the icon beside it shows its output
		await userEvent.click(canvas.getByRole('button', { name: 'Run Web server' }));
		await expect(canvas.getByText('Run: web')).toBeVisible();
		canvas.getByRole('button', { name: 'Run Web server' }).focus();
		await userEvent.click(canvas.getByRole('button', { name: 'Show terminal of Web server' }));
		await expect(canvas.getByText('Show: web')).toBeVisible();
		await expect(canvas.getByTitle('Ended with status 1')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Run Reset development data' }));
		await expect(canvas.getByText('Run: reset')).toBeVisible();
		// a middle click on a task that ran goes to its terminal…
		await fireEvent(
			canvas.getByRole('button', { name: 'Run Storybook' }),
			new MouseEvent('auxclick', { button: 1, bubbles: true })
		);
		await expect(canvas.getByText('Show: storybook')).toBeVisible();
		// and on one that never ran starts it, and goes to its terminal once it is there
		await fireEvent(
			canvas.getByRole('button', { name: 'Run Electron dev app' }),
			new MouseEvent('auxclick', { button: 1, bubbles: true })
		);
		await expect(canvas.getByText('Run and show: desktop')).toBeVisible();
		// a task that never ran has no output to show
		await expect(
			canvas.queryByRole('button', { name: 'Show terminal of Electron dev app' })
		).toBeNull();
		// a link that needs nothing just opens
		await userEvent.click(canvas.getByRole('button', { name: 'Open Handbook' }));
		await expect(canvas.getByText('Run: handbook')).toBeVisible();
		// what runs can be stopped; what is stopped has nothing to stop
		canvas.getByRole('button', { name: 'Run Agent daemon' }).focus();
		await userEvent.click(canvas.getByRole('button', { name: 'Stop Agent daemon' }));
		await expect(canvas.getByText('Stop: daemon')).toBeVisible();
		canvas.getByRole('button', { name: 'Run Website' }).focus();
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
		const row = (name: string) => canvas.getByRole('button', { name }).closest('div')!;
		const web = row('Run Web server');
		await expect(web.querySelector('[class~="icon-[lucide--play]"]')).toBeVisible();
		const daemon = row('Run Agent daemon');
		await expect(daemon.querySelector('[class~="icon-[lucide--refresh-cw]"]')).toBeVisible();
		await expect(daemon.querySelector('[class~="icon-[lucide--play]"]')).toBeNull();
	}}
>
	{@render pane(() => 'running', null, true)}
</Story>
<Story
	name="Loading"
	asChild
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('status')).toBeVisible();
	}}
>
	{@render pane(() => 'stopped', null, false, true)}
</Story>
{#snippet groupedPane()}
	<div class="flex h-120 w-96 flex-col sheet-quiet">
		<RunPane
			tasks={grouped}
			stateOf={(name) => groupStates[name] ?? 'stopped'}
			hasTerminal={(name) => name in groupStates}
			run={(ref) => (last = `Run: ${ref}`)}
			stop={(name) => (last = `Stop: ${name}`)}
			show={(name) => (last = `Show: ${name}`)}
		/>
	</div>
{/snippet}

<Story
	name="Task groups"
	asChild
	play={async ({ canvas, userEvent }) => {
		localStorage.removeItem('geordi:tasks-folded');
		// a group stands where its first task would, its tasks named without it
		const sorties = canvas.getByRole('list', { name: 'Sorties' });
		await expect(
			within(sorties)
				.getAllByRole('button', { name: /^Run / })
				.map((row) => row.getAttribute('aria-label'))
		).toEqual(['Run Ring 1', 'Run Ring 2', 'Run Ring 3']);
		const rows = canvas
			.getAllByRole('button', { name: /^Run / })
			.map((row) => row.getAttribute('aria-label'));
		await expect(rows.indexOf('Run Ring 1')).toBeLessThan(rows.indexOf('Run Shipyard'));
		await expect(rows.indexOf('Run Ring 3')).toBeLessThan(rows.indexOf('Run Shipyard'));
		// folded, a group hides its tasks, and still says that something in it runs
		const finales = canvas.getByRole('button', { name: /Finales/ });
		const entries = within(canvas.getByRole('list', { name: 'Tasks' }))
			.getAllByRole('listitem')
			.filter((row) => row.parentElement?.getAttribute('aria-label') === 'Tasks');
		await expect(entries.map((row) => getComputedStyle(row, '::before').height)).toEqual([
			'auto',
			'1px',
			'1px',
			'1px'
		]);
		const pane = finales.closest('.scroller')!;
		const sheet = pane.closest('.sheet-quiet')!;
		await expect(getComputedStyle(sheet).getPropertyValue('--tw-ring-inset').trim()).toBe('inset');
		await expect(getComputedStyle(entries[1], '::before').width).toBe(`${pane.clientWidth}px`);
		const heading = within(finales);
		const header = finales.parentElement!;
		const expandedColor = getComputedStyle(heading.getByText('Finales')).color;
		// open, what a task needs is shown on its own row; folded, on the group's
		const play = canvas.getByRole('button', { name: 'Run Play' });
		await userEvent.hover(play);
		await expect(header).not.toHaveClass('bg-hover');
		await expect(
			canvas.getByRole('button', { name: 'Run Act 2: the duel' }).closest('div')
		).toHaveClass('bg-hover');
		await expect(heading.queryByRole('img', { name: 'Running' })).toBeNull();
		await userEvent.click(finales);
		await expect(finales).toHaveAttribute('aria-expanded', 'false');
		await waitFor(() =>
			expect(canvas.queryByRole('button', { name: 'Run Act 2: the duel' })).toBeNull()
		);
		await expect(heading.getByRole('img', { name: 'Running' })).toBeVisible();
		// and says so to whoever hears it, too
		await expect(finales).toHaveAccessibleName(/Finales.*Running/);
		await userEvent.hover(play);
		await expect(header).toHaveClass('bg-hover');
		await expect(getComputedStyle(heading.getByText('Finales')).color).not.toBe(expandedColor);
		await userEvent.click(finales);
		await waitFor(() =>
			expect(canvas.getByRole('button', { name: 'Run Act 2: the duel' })).toBeVisible()
		);
	}}
>
	{@render groupedPane()}
</Story>
<Story name="Task groups in dark mode" globals={{ theme: 'dark' }} asChild>
	{@render groupedPane()}
</Story>
<Story name="Unreadable configuration" asChild>
	{@render pane(
		() => 'stopped',
		'`run`, `jobs` are no longer read: say what to run under `tasks`, each with the ports it listens on'
	)}
</Story>
