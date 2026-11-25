<script lang="ts">
	import { palettes, type Palette } from '#lib/theme.svelte.ts';

	let { value = $bindable() }: { value: Palette } = $props();
</script>

<fieldset class="@container mt-6">
	<legend class="mb-2 text-sm font-medium">Palette</legend>
	<div class="grid grid-cols-2 gap-3 @md:grid-cols-3">
		{#each palettes as palette (palette)}
			<label class="min-w-0 cursor-pointer">
				<input
					class="peer sr-only"
					type="radio"
					name="palette"
					value={palette}
					bind:group={value}
				/>
				<span
					class={[
						'block rounded-card p-1 ring-1 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ink',
						value === palette ? 'ring-2 ring-accent-ink' : 'ring-line hover:bg-hover'
					]}
				>
					<span
						data-palette={palette}
						aria-hidden="true"
						class="flex h-20 gap-1.5 rounded-card bg-frame p-1.5"
					>
						<span class="flex w-1/4 flex-col gap-1.5 rounded-control bg-sidebar p-1.5">
							<span class="h-1 w-2/3 rounded-full bg-muted"></span>
							<span class="h-1.5 rounded-full bg-surface"></span>
							<span class="h-1 w-3/4 rounded-full bg-line"></span>
						</span>
						<span class="flex min-w-0 flex-1 flex-col gap-1.5 rounded-control bg-bg p-1.5">
							<span class="ml-auto h-2 w-3/5 rounded-full bg-bubble"></span>
							<span class="h-1 w-2/3 rounded-full bg-muted"></span>
							<span class="h-1 w-1/2 rounded-full bg-line"></span>
							<span class="mt-auto flex justify-end rounded-control raised p-1">
								<span class="h-1.5 w-3 rounded-full bg-accent"></span>
							</span>
						</span>
					</span>
					<span class="flex items-center justify-between px-2 py-1 text-sm font-medium">
						{palette}
						{#if value === palette}<span
								aria-hidden="true"
								class="icon-[lucide--check] size-4 text-accent-ink"
							></span>{/if}
					</span>
				</span>
			</label>
		{/each}
	</div>
</fieldset>
