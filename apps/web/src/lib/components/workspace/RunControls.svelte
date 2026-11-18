<script lang="ts">
	import type { Job, Link, RepoConfig } from '@geordi/protocol';
	import ButtonGroup from '#lib/ui/ButtonGroup.svelte';
	import Button from '#lib/ui/Button.svelte';
	import { openMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';

	let {
		defaultTarget,
		jobs,
		links,
		isUp,
		launching,
		start,
		stop,
		visit,
		problem = null
	}: {
		defaultTarget?: RepoConfig['default'];
		jobs: Job[];
		links: Link[];
		isUp: (name: string) => boolean;
		launching: ReadonlySet<string>;
		start: (names: string[]) => void;
		stop: (name: string) => void;
		visit: (link: Link) => void;
		problem?: string | null;
	} = $props();

	const link = $derived(
		defaultTarget ? links.find((link) => `urls.${link.name}` === defaultTarget) : links[0]
	);
	const job = $derived(
		defaultTarget ? jobs.find((job) => `jobs.${job.name}` === defaultTarget) : jobs[0]
	);

	/** What the Run button offers where there is more than one thing: links first, then jobs. */
	const menu = (): MenuItem[] => {
		const opens = links.map((link): MenuItem => ({
			label: link.label ?? link.name,
			icon: 'icon-[lucide--external-link]',
			onselect: () => visit(link)
		}));
		if (jobs.length === 0) return opens;
		return [
			...opens,
			...(opens.length > 0 ? ['separator' as const] : []),
			...jobs.map(({ name, label }): MenuItem =>
				isUp(name)
					? {
							label: `Stop ${label ?? name}`,
							icon: 'icon-[lucide--square]',
							onselect: () => stop(name)
						}
					: {
							label: `Start ${label ?? name}`,
							icon: 'icon-[lucide--play]',
							onselect: () => start([name])
						}
			),
			'separator',
			{
				label: 'Start all',
				icon: 'icon-[lucide--list-video]',
				disabled: jobs.every((job) => isUp(job.name)),
				onselect: () => start(jobs.map((job) => job.name))
			},
			{
				label: 'Stop all',
				icon: 'icon-[lucide--circle-stop]',
				disabled: !jobs.some((job) => isUp(job.name)),
				onselect: () => jobs.filter((job) => isUp(job.name)).forEach((job) => stop(job.name))
			}
		];
	};
</script>

{#snippet primary()}
	{#if link}
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--play]"
			label="Open {link.label ?? link.name}"
			working={link.needs.some((name) => launching.has(name))}
			onclick={() => visit(link)}>Run</Button
		>
	{:else if job}
		{#if isUp(job.name) || launching.has(job.name)}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--square]"
				working={launching.has(job.name)}
				label="Stop {job.label ?? job.name}"
				onclick={() => stop(job.name)}
			>
				Stop{jobs.length + links.length === 1 && job.label ? ` ${job.label}` : ''}
			</Button>
		{:else}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--play]"
				label="Run {job.label ?? job.name}: {job.command}"
				onclick={() => start([job.name])}
			>
				Run{jobs.length + links.length === 1 && job.label ? ` ${job.label}` : ''}
			</Button>
		{/if}
	{/if}
{/snippet}

{#if jobs.length + links.length > 1}
	<ButtonGroup label="Run controls">
		{@render primary()}
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--chevron-down]"
			class="self-center"
			label="Run menu"
			aria-haspopup="menu"
			onclick={(event) => openMenu(event.currentTarget, menu())}
		/>
	</ButtonGroup>
{:else if link || job}
	{@render primary()}
{:else if problem}
	<!-- a configuration nobody can read is worth knowing about, quietly -->
	<span
		class="mr-1.5 icon-[lucide--triangle-alert] size-4 shrink-0 text-muted"
		role="img"
		aria-label={problem}
		title={problem}
	></span>
{/if}
