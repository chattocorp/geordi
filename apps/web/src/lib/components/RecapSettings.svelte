<script lang="ts">
	import Segmented from '#lib/ui/Segmented.svelte';
	import { recapPreference } from '#lib/recap-preference.svelte.ts';
	import type { RecapTotals } from '#lib/server/recap-usage.ts';
	let { totals }: { totals?: RecapTotals } = $props();
</script>

<div class="flex items-center justify-between gap-4 pt-6">
	<div>
		<p class="text-sm font-medium">Workspace recaps</p>
		<p class="text-sm text-muted">
			After five minutes away, show a recap if a turn ended or a new question arrived. Each recap
			uses agent tokens.
		</p>
		{#if totals && (totals.claude || totals.codex)}
			<p class="mt-1 text-xs text-muted">
				Recap tokens on this installation · Claude {totals.claude.toLocaleString()} · Codex {totals.codex.toLocaleString()}
			</p>
		{/if}
	</div>
	<Segmented
		label="Workspace recaps"
		bind:value={
			() => (recapPreference.on ? 'on' : 'off'), (value) => (recapPreference.on = value === 'on')
		}
		options={[
			{ value: 'on', label: 'On' },
			{ value: 'off', label: 'Off' }
		]}
	/>
</div>
