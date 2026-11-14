<script lang="ts">
	import { getStatus } from './status.remote';

	const status = getStatus();
</script>

<main class="mx-auto max-w-2xl p-8">
	<h1 class="text-3xl font-bold">Geordi</h1>
	<p class="text-gray-500">Self-hostable code forge &amp; agent orchestrator.</p>

	<p class="mt-8 font-mono text-sm">
		<span class={status.connected ? 'text-green-600' : 'text-red-600'}>●</span>
		server uptime: {(await status).uptime}s
	</p>
</main>
