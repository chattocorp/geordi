<script lang="ts">
	import type { ActivityId as Activity } from './actions.ts';
	import Spinner from './Spinner.svelte';
	import StatusCircle from './StatusCircle.svelte';

	let { activity }: { activity: Activity } = $props();

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
		'auto-merge': 'Merging when ready',
		'restore-worktree': 'Restoring worktree',
		continue: 'Continuing on a new branch',
		retry: 'Retrying',
		working: 'Working'
	};
	const merging = $derived(['merge-pull', 'enable-auto-merge', 'auto-merge'].includes(activity));
	const fixing = $derived(['fix-checks', 'resolve-conflicts', 'address-review'].includes(activity));
</script>

<StatusCircle
	label={labels[activity]}
	tone={merging ? 'ok' : fixing ? 'danger' : activity === 'archive' ? 'merged' : 'neutral'}
>
	{#if merging}
		<span class="icon-[lucide--git-merge] size-4"></span>
		<span class="merge-trace absolute top-0 left-0 size-1.25 rounded-full bg-current"></span>
		<span class="merge-ripple absolute top-4 left-4 size-2 rounded-full border border-current"
		></span>
	{:else if fixing}
		<span class="repair icon-[lucide--wrench] size-4"></span>
	{:else if activity === 'archive'}
		<span class="absolute inset-0 overflow-hidden rounded-full">
			<span class="archive-arrow absolute top-0 left-1.5 icon-[lucide--arrow-down] size-3"></span>
		</span>
		<span class="archive-tray icon-[lucide--inbox] size-4"></span>
	{:else if activity === 'working' || activity === 'retry'}
		<span aria-hidden="true" class="inline-flex"><Spinner /></span>
	{:else}
		<span class="icon-[lucide--refresh-cw] size-4 motion-safe:animate-checks-spin"></span>
	{/if}
</StatusCircle>

<style>
	/*
	 * Merging: a commit runs down the branch's curve into the merged node, which ripples as
	 * it lands. Archiving: an arrow drops into the tray, which gives under it. The path is
	 * the git-merge icon's, in the circle's pixels (the 16px icon sits 4px in).
	 */
	.merge-trace {
		offset-path: path('M8 8 V10 A6 6 0 0 0 14 16 H16');
		offset-rotate: 0deg;
		opacity: 0;
	}
	.merge-ripple {
		translate: -50% -50%;
		opacity: 0;
	}
	.archive-tray {
		translate: 0 0.13rem;
	}
	.archive-arrow {
		translate: 0 0.125rem;
	}
	@media (prefers-reduced-motion: no-preference) {
		.merge-trace {
			animation: merge-run 1.8s ease-in-out infinite;
		}
		.merge-ripple {
			animation: merge-ripple 1.8s ease-out infinite;
		}
		.repair {
			transform-origin: 28% 72%;
			animation: tighten 1.4s ease-in-out infinite;
		}
		.archive-arrow {
			animation: file-away 1.8s infinite;
		}
		.archive-tray {
			animation: take-in 1.8s infinite;
		}
	}
	@keyframes merge-run {
		0% {
			offset-distance: 0%;
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		60% {
			offset-distance: 100%;
			opacity: 1;
		}
		75%,
		100% {
			offset-distance: 100%;
			opacity: 0;
		}
	}
	@keyframes merge-ripple {
		0%,
		58% {
			opacity: 0;
			scale: 0.6;
		}
		62% {
			opacity: 1;
			scale: 1;
		}
		95%,
		100% {
			opacity: 0;
			scale: 1.9;
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
			opacity: 1;
			translate: 0 -0.75rem;
			animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.5);
		}
		40% {
			opacity: 1;
			translate: 0 0.4rem;
		}
		50%,
		100% {
			opacity: 0;
			translate: 0 0.7rem;
		}
	}
	@keyframes take-in {
		0%,
		38% {
			translate: 0 0.13rem;
		}
		48% {
			translate: 0 0.25rem;
			animation-timing-function: cubic-bezier(0.3, 1.6, 0.6, 1);
		}
		75%,
		100% {
			translate: 0 0.13rem;
		}
	}
</style>
