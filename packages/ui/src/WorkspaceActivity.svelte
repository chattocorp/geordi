<script lang="ts">
	import type { WorkspaceAction } from './actions.ts';
	import Spinner from './Spinner.svelte';

	type Activity = WorkspaceAction['id'] | 'working' | 'jobs';
	let { activity, jobs = [] }: { activity: Activity; jobs?: string[] } = $props();

	const labels: Record<Activity, string> = {
		'merge-pull': 'Merging pull request',
		'fix-checks': 'Fixing checks',
		'resolve-conflicts': 'Resolving conflicts',
		'address-review': 'Addressing review',
		archive: 'Archiving',
		'merge-upstream': 'Syncing branch',
		commit: 'Committing changes',
		'create-pull': 'Opening pull request',
		'update-pull': 'Updating pull request',
		'ready-for-review': 'Marking ready for review',
		'enable-auto-merge': 'Enabling auto-merge',
		'cancel-auto-merge': 'Disabling auto-merge',
		'restore-worktree': 'Restoring worktree',
		continue: 'Continuing on a new branch',
		retry: 'Retrying',
		working: 'Working',
		jobs: 'Running jobs'
	};
	const jobLabel = $derived(jobs.length ? 'Running ' + jobs.join(', ') : '');
	const label = $derived(
		activity === 'jobs' ? jobLabel : [labels[activity], jobLabel].filter(Boolean).join(' · ')
	);
	const merging = $derived(activity === 'merge-pull' || activity === 'enable-auto-merge');
	const fixing = $derived(['fix-checks', 'resolve-conflicts', 'address-review'].includes(activity));
</script>

<span
	role="img"
	aria-label={label}
	title={label}
	class={[
		'relative grid size-6 place-items-center rounded-full',
		merging
			? 'bg-ok/12 text-ok'
			: fixing
				? 'bg-danger-soft text-danger'
				: activity === 'archive'
					? 'bg-merged/15 text-merged'
					: 'bg-hover text-muted'
	]}
>
	{#if merging}
		<span class="icon-[lucide--git-merge] size-4"></span>
		<span class="merge-trace absolute size-1 rounded-full bg-current"></span>
	{:else if fixing}
		<span class="repair icon-[lucide--wrench] size-4"></span>
	{:else if activity === 'archive'}
		<span class="archive-tray icon-[lucide--inbox] size-4"></span>
		<span class="archive-arrow absolute icon-[lucide--arrow-down] size-3"></span>
	{:else if activity === 'working' || activity === 'retry'}
		<span aria-hidden="true" class="inline-flex"><Spinner /></span>
	{:else}
		<span
			class={[
				'cycle size-4',
				activity === 'jobs' ? 'icon-[lucide--cog]' : 'icon-[lucide--refresh-cw]'
			]}
		></span>
	{/if}
</span>

<style>
	.merge-trace {
		transform: translate(0.23rem, 0.18rem);
	}
	.archive-tray {
		transform: translateY(0.13rem);
	}
	.archive-arrow {
		transform: translateY(-0.25rem);
	}
	@media (prefers-reduced-motion: no-preference) {
		.merge-trace {
			animation: converge 1.6s ease-in-out infinite;
		}
		.repair {
			transform-origin: 28% 72%;
			animation: tighten 1.4s ease-in-out infinite;
		}
		.archive-arrow {
			animation: file-away 1.6s ease-in infinite;
		}
		.cycle {
			animation: revolve 3s linear infinite;
		}
	}
	@keyframes converge {
		0% {
			opacity: 0;
			transform: translate(-0.24rem, -0.26rem);
		}
		18% {
			opacity: 1;
			transform: translate(-0.22rem, -0.18rem);
		}
		48% {
			transform: translate(-0.12rem, 0.09rem);
		}
		72%,
		100% {
			opacity: 0;
			transform: translate(0.25rem, 0.25rem);
		}
	}
	@keyframes tighten {
		0%,
		65%,
		100% {
			transform: rotate(0);
		}
		35% {
			transform: rotate(-26deg);
		}
		52% {
			transform: rotate(6deg);
		}
	}
	@keyframes file-away {
		0% {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
		20%,
		40% {
			opacity: 1;
			transform: translateY(-0.33rem);
		}
		78%,
		100% {
			opacity: 0;
			transform: translateY(0.12rem);
		}
	}
	@keyframes revolve {
		to {
			transform: rotate(1turn);
		}
	}
</style>
