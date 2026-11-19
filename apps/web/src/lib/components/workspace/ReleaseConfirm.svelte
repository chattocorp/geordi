<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import type { ReleaseQuestion } from './release-review.svelte.ts';

	let { asking }: { asking: ReleaseQuestion | null } = $props();
	const title = $derived(
		asking?.problem
			? 'Release plan unavailable'
			: asking?.auto
				? 'Release impact when enabled'
				: 'Review release impact'
	);
</script>

<Dialog
	bind:open={() => !!asking, (open) => !open && asking?.answer('cancel')}
	label={title}
	class="max-w-lg"
>
	{#if asking}
		<div class="space-y-4 p-6">
			<h2 class="heading">{title}</h2>
			{#if asking.problem}
				<p class="text-sm wrap-anywhere text-prose">{asking.problem}</p>
			{:else}
				<ul class="scroller max-h-64 space-y-3">
					{#each asking.increases as pkg (pkg.path)}
						<li>
							<p class="font-semibold wrap-anywhere">{pkg.name}</p>
							<p class="text-sm text-prose">
								{pkg.before}{pkg.from === 'none' ? ' (no release pending)' : ' (' + pkg.from + ')'}
								→ {pkg.after} ({pkg.to})
							</p>
						</li>
					{/each}
				</ul>
				{#if asking.auto}<p class="text-sm text-muted">
						The target branch can change before this PR merges.
					</p>{/if}
			{/if}
			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="soft" onclick={() => asking?.answer('cancel')}>Cancel</Button>
				{#if asking.problem}
					{#if !asking.auto}<Button onclick={() => asking?.answer('confirm')}
							>Merge without release check</Button
						>{/if}
					<Button variant="primary" onclick={() => asking?.answer('retry')}>Retry</Button>
				{:else}
					<Button variant="primary" onclick={() => asking?.answer('confirm')}
						>{asking.auto ? 'Enable auto-merge' : 'Merge PR'}</Button
					>
				{/if}
			</div>
		</div>
	{/if}
</Dialog>
