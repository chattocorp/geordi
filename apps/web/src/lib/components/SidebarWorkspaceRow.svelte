<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { MergeVersions } from '#lib/server/views.ts';

	let {
		workspaceId,
		...row
	}: Omit<ComponentProps<typeof WorkspaceRow>, 'versions'> & {
		workspaceId?: string;
	} = $props();

	const releases = follow<MergeVersions>('mergeVersions', () => workspaceId);
</script>

<WorkspaceRow
	{...row}
	versions={releases.current?.id === workspaceId ? releases.current?.versions : undefined}
/>
