<script lang="ts">
	import type { Job, Link } from '@geordi/protocol';
	import Button from '#lib/ui/Button.svelte';
	import { openMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';

	let {
		jobs,
		links,
		isUp,
		launching,
		start,
		stop,
		visit,
		problem = null
	}: {
		jobs: Job[];
		links: Link[];
		isUp: (name: string) => boolean;
		launching: ReadonlySet<string>;
		start: (names: string[]) => void;
		stop: (name: string) => void;
		visit: (link: Link) => void;
		problem?: string | null;
	} = $props();

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

{#if jobs.length === 1 && links.length === 0}
	<!-- one thing to run: a button says it all -->
	{@const [job] = jobs}
	{#if isUp(job.name) || launching.has(job.name)}
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--square]"
			working={launching.has(job.name)}
			label="Stop {job.label ?? job.name}"
			onclick={() => stop(job.name)}
		>
			Stop{job.label ? ` ${job.label}` : ''}
		</Button>
	{:else}
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--play]"
			label="Run {job.label ?? job.name}: {job.command}"
			onclick={() => start([job.name])}
		>
			Run{job.label ? ` ${job.label}` : ''}
		</Button>
	{/if}
{:else if jobs.length > 0 || links.length > 0}
	<Button
		variant="ghost"
		size="sm"
		icon="icon-[lucide--play]"
		working={jobs.some((job) => launching.has(job.name))}
		label="Open what the project serves, and start and stop what it runs"
		aria-haspopup="menu"
		onclick={(event) => openMenu(event.currentTarget, menu())}
	>
		Run
		<span class="icon-[lucide--chevron-down] size-3.5"></span>
	</Button>
{:else if problem}
	<!-- a configuration nobody can read is worth knowing about, quietly -->
	<span
		class="mr-1.5 icon-[lucide--triangle-alert] size-4 shrink-0 text-muted"
		role="img"
		aria-label={problem}
		title={problem}
	></span>
{/if}
