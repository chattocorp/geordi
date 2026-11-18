<script lang="ts">
	import Overview from '#lib/components/Overview.svelte';
	import { connection, follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';

	const nav = follow<Navigation>('navigation');
</script>

<Overview nav={nav.current} lost={connection.state === 'lost'} />
