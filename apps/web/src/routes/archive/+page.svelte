<script lang="ts">
	import Archive from '#lib/components/Archive.svelte';
	import { connection, follow } from '#lib/live.svelte.ts';
	import type { ArchiveEntry } from '#lib/server/views.ts';
	import { purgeWorkspaces } from '../workspaces.remote';

	const archive = follow<ArchiveEntry[]>('archive');
</script>

<Archive
	entries={archive.current}
	lost={connection.state === 'lost'}
	onpurge={(ids) => purgeWorkspaces(ids)}
/>
