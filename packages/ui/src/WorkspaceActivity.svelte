<script lang="ts">
	import type { ActivityId as Activity } from './actions.ts';
	import ProgressIcon from './ProgressIcon.svelte';
	import Spinner from './Spinner.svelte';
	import StatusIcon from './StatusIcon.svelte';

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
		'restore-workspace': 'Restoring workspace',
		'restore-worktree': 'Restoring worktree',
		continue: 'Continuing on a new branch',
		retry: 'Retrying',
		working: 'Working'
	};
	const merging = $derived(['merge-pull', 'enable-auto-merge', 'auto-merge'].includes(activity));
	const fixing = $derived(['fix-checks', 'resolve-conflicts', 'address-review'].includes(activity));
</script>

<StatusIcon
	label={labels[activity]}
	tone={merging ? 'ok' : fixing ? 'danger' : activity === 'archive' ? 'merged' : 'neutral'}
>
	{#if activity === 'working'}
		<span aria-hidden="true" class="inline-flex"><Spinner /></span>
	{:else}
		<ProgressIcon class="size-4" />
	{/if}
</StatusIcon>
