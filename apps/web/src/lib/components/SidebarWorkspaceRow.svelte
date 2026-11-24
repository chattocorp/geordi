<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { MergeVersions } from '#lib/server/views.ts';

	let {
		workspaceId,
		...row
	}: Omit<ComponentProps<typeof WorkspaceRow>, 'versions'> & {
		workspaceId: string;
	} = $props();

	const releaseId = $derived(
		row.onaction &&
			row.standing?.tone === 'ok' &&
			row.actions?.find((action) => !action.aside)?.id === 'merge-pull'
			? workspaceId
			: undefined
	);
	const releases = follow<MergeVersions>('mergeVersions', () => releaseId);
</script>

<WorkspaceRow
	{...row}
	versions={releases.current?.id === workspaceId ? releases.current.versions : undefined}
/>
