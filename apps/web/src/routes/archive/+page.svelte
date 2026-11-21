<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Archive from '#lib/components/Archive.svelte';
	import { connection, follow } from '#lib/live.svelte.ts';
	import type { ArchiveEntry } from '#lib/server/views.ts';
	import { purgeWorkspaces, restoreWorkspace } from '../workspaces.remote';

	const archive = follow<ArchiveEntry[]>('archive');
</script>

<Archive
	entries={archive.current}
	lost={connection.state === 'lost'}
	onrestore={async (id) => {
		await restoreWorkspace(id);
		await goto(resolve('/workspaces/[id]', { id }));
	}}
	onpurge={(ids) => purgeWorkspaces(ids)}
/>
